import { db } from "../db/db";
import { eq, and, or, inArray, sql } from "drizzle-orm";
import { games, gameLines, props, picks, gamePicks, parlays, parlayLegs } from "../db/schema";
import { getGameStats } from "./espnApi";
import { playerNameKey } from "./playerName";
import { fetchEventsByID } from "./sportsGameOdds";
import { Grade, gradeOverUnder, gradeGameLine, creditFor, settleParlay } from "./grading";
import { creditStake } from "./betLedger";
import { GradeAttempts, pastGradeDeadline } from "./gradeRetry";
import { invalidateGameMarkets } from "./weekBoard";

const sgoAttempts = new GradeAttempts();

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

/**
 * Grade one bet and pay it, as one transaction guarded on the bet still being
 * PENDING.
 *
 * Every caller reads PENDING rows first and then closes them one by one, which
 * is only idempotent if nothing else closes them in between. The score sync
 * job, the hourly resolve and the manual resolve routes can all reach the same
 * game at once, and each used to update and credit as two separate statements:
 * both runs paid, and a crash between the two writes lost the payout. The
 * conditional UPDATE lets exactly one run claim the bet, and the credit commits
 * with it or not at all.
 */
async function closeBet(
  table: any,
  id: string,
  set: Record<string, unknown>,
  owner: { userId: string; leagueId: string },
  amount: number,
): Promise<void> {
  await db.transaction(async (tx) => {
    const claimed = await tx.update(table)
      .set(set)
      .where(and(eq(table.id, id), eq(table.outcome, "PENDING")))
      .returning({ id: table.id });
    if (claimed.length === 0 || amount <= 0) return;
    await creditStake(tx, owner.userId, owner.leagueId, amount);
  });
}

/**
 * Fill in `Prop.result` for a finished game.
 *
 * Primary: SportsGameOdds grades each market it priced and returns the value on
 * the same oddID we stored, so the lookup is by id — no player-name matching,
 * and no stat-field table to keep in step. Costs one entity, and `oddsSettledAt`
 * makes sure that happens once rather than on every minute-by-minute tick.
 *
 * RETURNS WHETHER PROPS ARE READY TO FINISH, meaning the ESPN fallback and the
 * DNP void may run. False while SGO has not finalized the event: `oddsSettledAt`
 * is what licenses `voidUngradedProps` to refund every prop still without a
 * result, so stamping it off an unfinished feed turned a lagging grader into
 * refunds, and running the ESPN fallback early would grade props SGO is about
 * to grade authoritatively. See services/gradeRetry.ts for the backoff and the
 * deadline past which an unfinalized event is taken as it stands.
 *
 * `atDeadline` is the week's resolve. It skips the backoff, because the week is
 * about to close and a bet left pending then stays pending for good.
 */
async function gradePropsFromSGO(game: any, atDeadline = false): Promise<boolean> {
  const ungraded = (game.props as any[]).filter((p) => p.result == null && p.oddID);
  if (ungraded.length === 0 || !game.externalId || game.oddsSettledAt) return true;

  const now = new Date();
  if (!atDeadline && !sgoAttempts.due(game.id, now)) return false;
  const acceptUnfinalized = atDeadline || pastGradeDeadline(game.gameDate, now);

  try {
    const [ev] = await fetchEventsByID([game.externalId]);
    // No event at all past the deadline: the feed has dropped the game, and
    // waiting longer will not bring it back. Stamp it, so the ESPN fallback
    // grades what it can and the rest refunds, rather than pending forever.
    if (!ev && !acceptUnfinalized) {
      sgoAttempts.record(game.id, now);
      return false;
    }
    // Scores on an unfinalized event are not written at all, not even the ones
    // present: they may be in-progress values, and a prop graded on one is
    // settled for good.
    if (ev && !ev.finalized && !acceptUnfinalized) {
      sgoAttempts.record(game.id, now);
      console.log(`[settle] SGO has not finalized game ${game.id} yet, retrying later`);
      return false;
    }
    if (!ev) {
      await db.update(games).set({ oddsSettledAt: now }).where(eq(games.id, game.id));
      game.oddsSettledAt = now;
      sgoAttempts.clear(game.id);
      return true;
    }

    for (const prop of ungraded) {
      const score = ev.scores[prop.oddID];
      if (typeof score !== "number") continue;
      await db.update(props).set({ result: score }).where(eq(props.id, prop.id));
      // At the write, not once per settlement: the score sync retries this
      // every minute while SGO has not finalized, and a run that writes nothing
      // must not make the bet board re-read the game.
      invalidateGameMarkets(prop.gameId);
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

    await db.update(games).set({ oddsSettledAt: now }).where(eq(games.id, game.id));
    game.oddsSettledAt = now;
    sgoAttempts.clear(game.id);
    return true;
  } catch (err) {
    console.error(`[settle] SGO grading failed for game ${game.id}:`, err);
    sgoAttempts.record(game.id, now);
    return false;
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
      invalidateGameMarkets(prop.gameId);
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
    await closeBet(picks, pk.id, { outcome: "VOID", voidReason: DNP_REASON }, pk, pk.stake);
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
      await closeBet(picks, pk.id, { outcome: "VOID", voidReason: reason }, pk, pk.stake);
      refunded++;
    }
  }

  if (lineIds.length > 0) {
    const pending = await db.query.gamePicks.findMany({
      where: and(eq(gamePicks.outcome, "PENDING"), inArray(gamePicks.gameLineId, lineIds)),
    });
    for (const gp of pending) {
      await closeBet(gamePicks, gp.id, { outcome: "VOID", voidReason: reason }, gp, gp.stake);
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
 *
 * Game lines settle on the final score straight away. Props wait for SGO to
 * finalize (see gradePropsFromSGO); until then their bets simply stay PENDING
 * and the next call tries again. `atDeadline` is for resolveWeekById only.
 */
export async function settleFinalGame(gameId: string, atDeadline = false): Promise<void> {
  const game = await db.query.games.findFirst({
    where: eq(games.id, gameId),
    with: { props: { with: { player: true } }, gameLines: true },
  }) as any;
  if (!game || game.status !== "FINAL") return;

  let voidedParlayIds: string[] = [];
  if (await gradePropsFromSGO(game, atDeadline)) {
    await gradePropsFromESPN(game);
    voidedParlayIds = await voidUngradedProps(game);
  }

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
      invalidateGameMarkets(gameId);
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
      await closeBet(picks, pick.id, { outcome: grade }, pick, creditFor(grade, pick.stake, pick.odds));
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
      await closeBet(gamePicks, gp.id, { outcome: grade }, gp, creditFor(grade, gp.stake, gp.odds));
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
    // WIN pays the (possibly re-priced) payout; VOID means every leg pushed and
    // the stake goes back. LOSS returns nothing.
    const paid = settled.outcome === "WIN" || settled.outcome === "VOID";
    await closeBet(parlays, parlay.id, {
      outcome: settled.outcome as any,
      ...(settled.totalOdds != null ? { totalOdds: settled.totalOdds, payout: settled.payout } : {}),
      ...(settled.outcome === "VOID"
        ? { voidReason: voidedLeg ? DNP_REASON : "Every leg pushed. Stake refunded." }
        : {}),
    }, parlay, paid ? settled.payout : 0);
  }
}

/**
 * Is any money still riding on this week's games? The rollover's second
 * condition: every game FINAL says the football is over, this says the grading
 * is too. Without it the rollover could close a week while props were still
 * waiting on SGO to finalize, and those bets would never settle.
 */
export async function weekHasPendingBets(weekId: string): Promise<boolean> {
  const weekGames = await db.select({ id: games.id }).from(games).where(eq(games.weekId, weekId));
  if (weekGames.length === 0) return false;
  const ids = weekGames.map((g) => g.id);

  const checks = await Promise.all([
    db.select({ id: picks.id }).from(picks).innerJoin(props, eq(picks.propId, props.id))
      .where(and(eq(picks.outcome, "PENDING"), inArray(props.gameId, ids))).limit(1),
    db.select({ id: gamePicks.id }).from(gamePicks).innerJoin(gameLines, eq(gamePicks.gameLineId, gameLines.id))
      .where(and(eq(gamePicks.outcome, "PENDING"), inArray(gameLines.gameId, ids))).limit(1),
    db.select({ id: parlayLegs.id }).from(parlayLegs).innerJoin(props, eq(parlayLegs.propId, props.id))
      .where(and(eq(parlayLegs.outcome, "PENDING"), inArray(props.gameId, ids))).limit(1),
    db.select({ id: parlayLegs.id }).from(parlayLegs).innerJoin(gameLines, eq(parlayLegs.gameLineId, gameLines.id))
      .where(and(eq(parlayLegs.outcome, "PENDING"), inArray(gameLines.gameId, ids))).limit(1),
  ]);
  return checks.some((rows) => rows.length > 0);
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
