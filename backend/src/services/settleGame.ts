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

// Fallback only. SGO grades props directly; ESPN covers 11 of our 23 stat types.
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

// Claim the PENDING bet and credit it in one transaction, so concurrent
// settlement runs (score sync, resolve, manual) can't pay twice.
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

// Writes Prop.result from SGO's graded markets, matched by oddID. Returns
// false while SGO hasn't finalized, so the ESPN fallback and DNP voids wait.
// `atDeadline` skips the backoff when the week is closing.
async function gradePropsFromSGO(game: any, atDeadline = false): Promise<boolean> {
  const ungraded = (game.props as any[]).filter((p) => p.result == null && p.oddID);
  if (ungraded.length === 0 || !game.externalId || game.oddsSettledAt) return true;

  const now = new Date();
  if (!atDeadline && !sgoAttempts.due(game.id, now)) return false;
  const acceptUnfinalized = atDeadline || pastGradeDeadline(game.gameDate, now);

  try {
    const [ev] = await fetchEventsByID([game.externalId]);
    // Feed dropped the game: stamp it so the fallback and refunds can run.
    if (!ev && !acceptUnfinalized) {
      sgoAttempts.record(game.id, now);
      return false;
    }
    // Don't write in-progress values.
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

/** Fallback for props SGO did not grade - 11 stat types, matched by name key. */
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
      // An unmatched name stays pending rather than being graded as 0.
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

// No result after grading means the player never played: refund. Guarded on
// oddsSettledAt so a failed fetch can't refund everything. Shown on the bet card.
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

// Refund everything on a cancelled game. Only touches PENDING rows.
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

  // Legs are voided, not refunded; settleParlay decides for the whole ticket.
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

// Idempotent: only PENDING rows are touched. Lines settle on the final score;
// props wait for SGO to finalize.
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

// Used by the rollover so a week isn't closed while props are still pending.
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
