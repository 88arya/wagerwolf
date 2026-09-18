import { db } from "../db/db";
import { eq, and, or, inArray, sql } from "drizzle-orm";
import { games, gameLines, props, picks, gamePicks, parlays, parlayLegs, memberships } from "../db/schema";
import { getGameStats } from "./espnApi";
import { playerNameKey } from "./playerName";
import { fetchEventsByID } from "./sportsGameOdds";
import { Grade, gradeOverUnder, gradeGameLine, creditFor, settleParlay } from "./grading";

/**
 * ESPN box-score fields, used only as a fallback.
 *
 * This table is why defensive and kicking props could never settle: it covers
 * 11 of our 23 StatTypes, and anything missing was left PENDING forever. The
 * primary path now reads the graded value straight off the market that set the
 * line (SportsGameOdds `score`), which needs no per-stat mapping at all and
 * covers every stat they price.
 */
const ESPN_STAT_FIELD: Partial<Record<string, string>> = {
  PASSING_YARDS: "passingYards",
  PASSING_TOUCHDOWNS: "passingTouchdowns",
  PASSING_COMPLETIONS: "passingCompletions",
  PASSING_ATTEMPTS: "passingAttempts",
  RUSHING_YARDS: "rushingYards",
  RUSHING_TOUCHDOWNS: "rushingTouchdowns",
  RUSHING_ATTEMPTS: "rushingAttempts",
  RECEIVING_YARDS: "receivingYards",
  RECEPTIONS: "receptions",
  RECEIVING_TOUCHDOWNS: "receivingTouchdowns",
  TOUCHDOWNS: "touchdowns",
};

async function credit(userId: string, leagueId: string, amount: number) {
  if (amount <= 0) return;
  await db.update(memberships)
    .set({ balance: sql`${memberships.balance} + ${amount}` })
    .where(and(eq(memberships.userId, userId), eq(memberships.leagueId, leagueId)));
}

/**
 * Fill in `Prop.result` for a finished game.
 *
 * Primary: SportsGameOdds grades each market it priced and returns the value on
 * the same oddID we stored, so the lookup is by id — no player-name matching,
 * and no stat-field table to keep in step. Costs one entity, and `oddsSettledAt`
 * makes sure that happens once rather than on every minute-by-minute tick.
 */
async function gradePropsFromSGO(game: any): Promise<void> {
  const ungraded = (game.props as any[]).filter((p) => p.result == null && p.oddID);
  if (ungraded.length === 0 || !game.externalId || game.oddsSettledAt) return;

  try {
    const [ev] = await fetchEventsByID([game.externalId]);
    if (!ev) return;

    for (const prop of ungraded) {
      const score = ev.scores[prop.oddID];
      if (typeof score !== "number") continue;
      await db.update(props).set({ result: score }).where(eq(props.id, prop.id));
      prop.result = score;
    }

    // Take the final score from the same source while we have it.
    if (ev.homeScore != null && ev.awayScore != null && (game.homeScore == null || game.awayScore == null)) {
      await db.update(games)
        .set({ homeScore: ev.homeScore, awayScore: ev.awayScore })
        .where(eq(games.id, game.id));
      game.homeScore = ev.homeScore;
      game.awayScore = ev.awayScore;
    }

    await db.update(games).set({ oddsSettledAt: new Date() }).where(eq(games.id, game.id));
    game.oddsSettledAt = new Date();
  } catch (err) {
    console.error(`[settle] SGO grading failed for game ${game.id}:`, err);
  }
}

/** Fallback for props SGO did not grade — 11 stat types, matched by name key. */
async function gradePropsFromESPN(game: any): Promise<void> {
  const ungraded = (game.props as any[]).filter((p) => p.result == null);
  if (ungraded.length === 0 || !game.espnId) return;

  try {
    const stats = await getGameStats(game.espnId);
    if (stats.size === 0) return;
    const byKey = new Map<string, any>();
    for (const [name, s] of stats) byKey.set(playerNameKey(name), s);

    for (const prop of ungraded) {
      const statKey = ESPN_STAT_FIELD[prop.statType as string];
      if (!statKey) continue;
      // A name we cannot find is NOT graded as a DNP here. The old code settled
      // it as 0 the moment a box score existed, so one spelling mismatch took
      // every Over on that player. Leaving it pending is recoverable; grading it
      // wrong is not.
      const playerStats = byKey.get(playerNameKey(prop.player.name));
      if (!playerStats) continue;
      const result = playerStats[statKey] ?? 0;
      await db.update(props).set({ result }).where(eq(props.id, prop.id));
      prop.result = result;
    }
  } catch (err) {
    console.error(`[settle] ESPN box score failed for game ${game.id}:`, err);
  }
}

/**
 * A prop the game finished without a result for. In practice that means the
 * player never took the field: the book pulls the market on a scratch, and the
 * feed then grades nothing.
 *
 * Guarded on `oddsSettledAt` so this only ever runs after a grading attempt
 * actually succeeded — without that, one failed fetch would refund every open
 * bet on the game.
 *
 * Note what is deliberately NOT here: an in-game injury. A player who takes one
 * snap and leaves is graded on what he did, like any book. Only never playing
 * refunds.
 */
// USER-FACING COPY, shown on the bet card, so it follows the docs' house rule
// of no em dashes. A period reads the same and does not import a glyph the rest
// of the product's copy has been cleared of.
const DNP_REASON = "Player did not play. Stake refunded.";

async function voidUngradedProps(game: any): Promise<string[]> {
  if (!game.oddsSettledAt) return [];
  const ungraded = (game.props as any[]).filter((p) => p.result == null);
  if (ungraded.length === 0) return [];
  const propIds = ungraded.map((p) => p.id);

  const pendingPicks = await db.query.picks.findMany({
    where: and(eq(picks.outcome, "PENDING"), inArray(picks.propId, propIds)),
  });
  for (const pk of pendingPicks) {
    await db.update(picks)
      .set({ outcome: "VOID", voidReason: DNP_REASON })
      .where(eq(picks.id, pk.id));
    await credit(pk.userId, pk.leagueId, pk.stake);
  }

  const pendingLegs = await db.query.parlayLegs.findMany({
    where: and(eq(parlayLegs.outcome, "PENDING"), inArray(parlayLegs.propId, propIds)),
  });
  for (const leg of pendingLegs) {
    await db.update(parlayLegs).set({ outcome: "VOID" }).where(eq(parlayLegs.id, leg.id));
  }

  if (pendingPicks.length || pendingLegs.length) {
    console.log(`[settle] Voided ${pendingPicks.length} picks and ${pendingLegs.length} parlay legs on ungraded props (game ${game.id})`);
  }
  return [...new Set(pendingLegs.map((l) => l.parlayId))];
}

/**
 * Refund everything riding on a game that was never played.
 *
 * `settleFinalGame` returns immediately on any status but FINAL, so a CANCELLED
 * game was settled by nothing at all: its picks, its game picks and every
 * parlay leg touching it stayed PENDING forever, while `resolveWeekById` marked
 * the week resolved around them. The stake had already been deducted at
 * placement, so that is not a bet left open — it is money taken for a game that
 * did not happen.
 *
 * VOID IS THE RIGHT GRADE, and it is the one the product already documents:
 * "cashed out, or the player never played". Nobody played. Every stake comes
 * back, whichever side it was on.
 *
 * NOT GUARDED ON `oddsSettledAt`, unlike `voidUngradedProps`. That guard exists
 * so a failed grading FETCH cannot be mistaken for "the player did not play" —
 * it is protection against a missing answer. Here there is no question to
 * answer: the status says the game was cancelled, and no feed is going to
 * change its mind.
 *
 * Idempotent, like everything else in this file: only PENDING rows are touched.
 */
export async function voidBetsOnUnplayedGame(
  gameId: string,
  reason: string,
): Promise<void> {
  const game = await db.query.games.findFirst({
    where: eq(games.id, gameId),
    with: { props: true, gameLines: true },
  }) as any;
  if (!game) return;

  const propIds = (game.props as any[]).map((p) => p.id);
  const lineIds = (game.gameLines as any[]).map((gl) => gl.id);
  if (propIds.length === 0 && lineIds.length === 0) return;

  let refunded = 0;

  if (propIds.length > 0) {
    const pending = await db.query.picks.findMany({
      where: and(eq(picks.outcome, "PENDING"), inArray(picks.propId, propIds)),
    });
    for (const pk of pending) {
      await db.update(picks)
        .set({ outcome: "VOID", voidReason: reason })
        .where(eq(picks.id, pk.id));
      await credit(pk.userId, pk.leagueId, pk.stake);
      refunded++;
    }
  }

  if (lineIds.length > 0) {
    const pending = await db.query.gamePicks.findMany({
      where: and(eq(gamePicks.outcome, "PENDING"), inArray(gamePicks.gameLineId, lineIds)),
    });
    for (const gp of pending) {
      await db.update(gamePicks)
        .set({ outcome: "VOID", voidReason: reason })
        .where(eq(gamePicks.id, gp.id));
      await credit(gp.userId, gp.leagueId, gp.stake);
      refunded++;
    }
  }

  // Legs are voided but NOT refunded individually — a parlay's stake was struck
  // once, against the combined odds, so the refund decision belongs to
  // `settleParlay` over the whole ticket. See the parlay rules in CLAUDE.md: a
  // voided leg refunds the ticket only while the ticket is still alive.
  const legs = await db.query.parlayLegs.findMany({
    where: and(
      eq(parlayLegs.outcome, "PENDING"),
      or(
        propIds.length > 0 ? inArray(parlayLegs.propId, propIds) : sql`false`,
        lineIds.length > 0 ? inArray(parlayLegs.gameLineId, lineIds) : sql`false`,
      ),
    ),
  });
  for (const leg of legs) {
    await db.update(parlayLegs).set({ outcome: "VOID" }).where(eq(parlayLegs.id, leg.id));
  }

  await settleTouchedParlays([...new Set(legs.map((l) => l.parlayId))]);

  if (refunded || legs.length) {
    console.log(
      `[settle] Game ${gameId} was not played — refunded ${refunded} wager(s) ` +
      `and voided ${legs.length} parlay leg(s)`
    );
  }
}

/**
 * Settle everything riding on one FINAL game.
 *
 * Idempotent: only PENDING rows are touched, so the minute-by-minute caller and
 * Tuesday's resolveWeekById can both run it safely.
 */
export async function settleFinalGame(gameId: string): Promise<void> {
  const game = await db.query.games.findFirst({
    where: eq(games.id, gameId),
    with: { props: { with: { player: true } }, gameLines: true },
  }) as any;
  if (!game || game.status !== "FINAL") return;

  await gradePropsFromSGO(game);
  await gradePropsFromESPN(game);
  const voidedParlayIds = await voidUngradedProps(game);

  const { homeScore, awayScore } = game;

  // 1) Game-line results
  if (homeScore != null && awayScore != null) {
    for (const gl of game.gameLines as any[]) {
      if (gl.result != null || gl.pushed) continue;
      const grade = gradeGameLine(gl.market, gl.line, homeScore, awayScore);
      if (grade == null) continue;
      await db.update(gameLines)
        .set({ result: grade === "WIN", pushed: grade === "PUSH" })
        .where(eq(gameLines.id, gl.id));
      gl.result = grade === "WIN";
      gl.pushed = grade === "PUSH";
    }
  }

  const propById = new Map((game.props as any[]).map((p) => [p.id, p]));
  const lineById = new Map((game.gameLines as any[]).map((gl) => [gl.id, gl]));
  const propIds = [...propById.keys()];
  const lineIds = [...lineById.keys()];

  const gradeLineFor = (gl: any, altLine: number | null): Grade | null => {
    if (homeScore == null || awayScore == null) return null;
    if (altLine != null && !gl.market.startsWith("MONEYLINE")) {
      return gradeGameLine(gl.market, altLine, homeScore, awayScore);
    }
    if (gl.pushed) return "PUSH";
    if (gl.result == null) return null;
    return gl.result ? "WIN" : "LOSS";
  };

  // 2) Single prop picks
  if (propIds.length > 0) {
    const pending = await db.query.picks.findMany({
      where: and(eq(picks.outcome, "PENDING"), inArray(picks.propId, propIds)),
    });
    for (const pick of pending) {
      const prop = propById.get(pick.propId);
      if (!prop || prop.result == null) continue;
      const grade = gradeOverUnder(prop.result, pick.altLine ?? prop.line, pick.direction);
      await db.update(picks).set({ outcome: grade }).where(eq(picks.id, pick.id));
      await credit(pick.userId, pick.leagueId, creditFor(grade, pick.stake, pick.odds));
    }
  }

  // 3) Game picks
  if (lineIds.length > 0) {
    const pending = await db.query.gamePicks.findMany({
      where: and(eq(gamePicks.outcome, "PENDING"), inArray(gamePicks.gameLineId, lineIds)),
    });
    for (const gp of pending) {
      const gl = lineById.get(gp.gameLineId);
      if (!gl) continue;
      const grade = gradeLineFor(gl, gp.altLine);
      if (grade == null) continue;
      await db.update(gamePicks).set({ outcome: grade }).where(eq(gamePicks.id, gp.id));
      await credit(gp.userId, gp.leagueId, creditFor(grade, gp.stake, gp.odds));
    }
  }

  // 4) Parlay legs touching this game, then the parlays themselves
  if (propIds.length === 0 && lineIds.length === 0) {
    await settleTouchedParlays(voidedParlayIds);
    return;
  }
  const touchingLegs = await db.query.parlayLegs.findMany({
    where: and(
      eq(parlayLegs.outcome, "PENDING"),
      or(
        propIds.length > 0 ? inArray(parlayLegs.propId, propIds) : sql`false`,
        lineIds.length > 0 ? inArray(parlayLegs.gameLineId, lineIds) : sql`false`,
      ),
    ),
  });
  // Legs voided just above are no longer PENDING, so the query above cannot see
  // their parlays — merge them back in explicitly.
  const touchedParlayIds = [...new Set([...touchingLegs.map((l) => l.parlayId), ...voidedParlayIds])];
  if (touchedParlayIds.length === 0) return;

  for (const leg of touchingLegs) {
    let grade: Grade | null = null;
    if (leg.propId) {
      const prop = propById.get(leg.propId);
      if (prop && prop.result != null) {
        grade = gradeOverUnder(prop.result, leg.altLine ?? prop.line, leg.direction!);
      }
    } else if (leg.gameLineId) {
      const gl = lineById.get(leg.gameLineId);
      if (gl) grade = gradeLineFor(gl, leg.altLine);
    }
    if (grade == null) continue;
    await db.update(parlayLegs).set({ outcome: grade }).where(eq(parlayLegs.id, leg.id));
  }

  await settleTouchedParlays(touchedParlayIds);
}

/** Re-price and close out any parlay whose legs are now fully graded. */
export async function settleTouchedParlays(parlayIds: string[]): Promise<void> {
  if (parlayIds.length === 0) return;
  const rows = await db.query.parlays.findMany({
    where: and(eq(parlays.outcome, "PENDING"), inArray(parlays.id, parlayIds)),
    with: { legs: true },
  });

  for (const parlay of rows) {
    const legs = (parlay as any).legs as any[];
    const settled = settleParlay(legs, parlay.stake);
    if (!settled || settled.outcome === "PENDING") continue;

    const voidedLeg = legs.some((l) => l.outcome === "VOID");
    await db.update(parlays)
      .set({
        outcome: settled.outcome as any,
        ...(settled.totalOdds != null ? { totalOdds: settled.totalOdds, payout: settled.payout } : {}),
        ...(settled.outcome === "VOID"
          ? { voidReason: voidedLeg ? DNP_REASON : "Every leg pushed. Stake refunded." }
          : {}),
      })
      .where(eq(parlays.id, parlay.id));

    // WIN pays the (possibly re-priced) payout; VOID means every leg pushed and
    // the stake goes back. LOSS returns nothing.
    if (settled.outcome === "WIN" || settled.outcome === "VOID") {
      await credit(parlay.userId, parlay.leagueId, settled.payout);
    }
  }
}

/**
 * Called after each live-score sync: settle every FINAL game in the week that
 * still has pending money on it. Cheap when nothing is pending, and self-healing
 * if the server restarts between FINAL and settle.
 */
export async function settlePendingBetsOnFinalGames(weekId: string): Promise<void> {
  const finalGames = await db.query.games.findMany({
    where: and(eq(games.weekId, weekId), eq(games.status, "FINAL")),
    columns: { id: true },
  });
  if (finalGames.length === 0) return;
  const finalIds = finalGames.map((g) => g.id);

  const [pendingPickGames, pendingGamePickGames, pendingPropLegGames, pendingLineLegGames] = await Promise.all([
    db.selectDistinct({ gameId: props.gameId })
      .from(picks).innerJoin(props, eq(picks.propId, props.id))
      .where(and(eq(picks.outcome, "PENDING"), inArray(props.gameId, finalIds))),
    db.selectDistinct({ gameId: gameLines.gameId })
      .from(gamePicks).innerJoin(gameLines, eq(gamePicks.gameLineId, gameLines.id))
      .where(and(eq(gamePicks.outcome, "PENDING"), inArray(gameLines.gameId, finalIds))),
    db.selectDistinct({ gameId: props.gameId })
      .from(parlayLegs).innerJoin(props, eq(parlayLegs.propId, props.id))
      .where(and(eq(parlayLegs.outcome, "PENDING"), inArray(props.gameId, finalIds))),
    db.selectDistinct({ gameId: gameLines.gameId })
      .from(parlayLegs).innerJoin(gameLines, eq(parlayLegs.gameLineId, gameLines.id))
      .where(and(eq(parlayLegs.outcome, "PENDING"), inArray(gameLines.gameId, finalIds))),
  ]);

  const needSettle = new Set<string>([
    ...pendingPickGames.map((r) => r.gameId),
    ...pendingGamePickGames.map((r) => r.gameId),
    ...pendingPropLegGames.map((r) => r.gameId),
    ...pendingLineLegGames.map((r) => r.gameId),
  ]);

  for (const gameId of needSettle) {
    try {
      await settleFinalGame(gameId);
      console.log(`[settle] Settled bets on final game ${gameId}`);
    } catch (err) {
      console.error(`[settle] Failed to settle game ${gameId}:`, err);
    }
  }
}
