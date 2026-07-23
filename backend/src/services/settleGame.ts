import { db } from "../db/db";
import { eq, and, or, inArray, sql } from "drizzle-orm";
import { games, gameLines, props, picks, gamePicks, parlays, parlayLegs, memberships } from "../db/schema";
import { getGameStats } from "./espnApi";
import { calcProfit } from "../lib/payout";

const STAT_FIELD: Partial<Record<string, string>> = {
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

function gameLineResult(market: string, line: number | null, homeScore: number, awayScore: number): boolean | null {
  switch (market) {
    case "MONEYLINE_HOME": return homeScore > awayScore;
    case "MONEYLINE_AWAY": return awayScore > homeScore;
    case "SPREAD_HOME":    return line != null ? (homeScore + line) > awayScore : null;
    case "SPREAD_AWAY":    return line != null ? (awayScore + line) > homeScore : null;
    case "TOTAL_OVER":     return line != null ? (homeScore + awayScore) > line : null;
    case "TOTAL_UNDER":    return line != null ? (homeScore + awayScore) < line : null;
    default: return null;
  }
}

async function creditWin(userId: string, leagueId: string, returned: number) {
  await db.update(memberships)
    .set({ balance: sql`${memberships.balance} + ${returned}` })
    .where(and(eq(memberships.userId, userId), eq(memberships.leagueId, leagueId)));
}

// Settles everything bettable on a single FINAL game so winnings are credited
// immediately and re-bettable on later games in the same week. Fully idempotent:
// results/outcomes already set are skipped, and Tuesday's resolveWeekById acts
// as the backstop for anything missed here (only PENDING work is ever touched).
export async function settleFinalGame(gameId: string): Promise<void> {
  const game = await db.query.games.findFirst({
    where: eq(games.id, gameId),
    with: { props: { with: { player: true } }, gameLines: true },
  }) as any;
  if (!game || game.status !== "FINAL") return;
  const { homeScore, awayScore } = game;

  // 1) Game line results from the final score
  if (homeScore != null && awayScore != null) {
    for (const gl of game.gameLines as any[]) {
      if (gl.result != null) continue;
      const result = gameLineResult(gl.market, gl.line, homeScore, awayScore);
      if (result == null) continue;
      await db.update(gameLines).set({ result }).where(eq(gameLines.id, gl.id));
      gl.result = result;
    }
  }

  // 2) Prop results from the ESPN box score for this game
  if (game.espnId && (game.props as any[]).some((p) => p.result == null)) {
    try {
      const gameStats = await getGameStats(game.espnId);
      const byName = new Map<string, any>();
      for (const [name, stats] of gameStats) byName.set(name.toLowerCase(), stats);
      for (const prop of game.props as any[]) {
        if (prop.result != null) continue;
        const playerStats = byName.get(prop.player.name.toLowerCase());
        if (!playerStats) continue;
        const statKey = STAT_FIELD[prop.statType as string];
        if (!statKey) continue;
        const result = playerStats[statKey] ?? null;
        if (result == null) continue;
        await db.update(props).set({ result }).where(eq(props.id, prop.id));
        prop.result = result;
      }
    } catch (err) {
      console.error(`[settle] Box score fetch failed for game ${gameId}:`, err);
    }
  }

  const propById = new Map((game.props as any[]).map((p) => [p.id, p]));
  const lineById = new Map((game.gameLines as any[]).map((gl) => [gl.id, gl]));
  const propIds = [...propById.keys()];
  const lineIds = [...lineById.keys()];

  // 3) Single prop picks — settle on the line the user actually bet (alt or base)
  if (propIds.length > 0) {
    const pendingPicks = await db.query.picks.findMany({
      where: and(eq(picks.outcome, "PENDING"), inArray(picks.propId, propIds)),
    });
    for (const pick of pendingPicks) {
      const prop = propById.get(pick.propId);
      if (!prop || prop.result == null) continue;
      const effectiveLine = pick.altLine ?? prop.line;
      const won = (pick.direction === "OVER" && prop.result > effectiveLine) ||
                  (pick.direction === "UNDER" && prop.result < effectiveLine);
      await db.update(picks).set({ outcome: won ? "WIN" : "LOSS" }).where(eq(picks.id, pick.id));
      if (won) await creditWin(pick.userId, pick.leagueId, pick.stake + calcProfit(pick.stake, pick.odds));
    }
  }

  // 4) Game picks
  if (lineIds.length > 0 && homeScore != null && awayScore != null) {
    const pendingGamePicks = await db.query.gamePicks.findMany({
      where: and(eq(gamePicks.outcome, "PENDING"), inArray(gamePicks.gameLineId, lineIds)),
    });
    for (const gp of pendingGamePicks) {
      const gl = lineById.get(gp.gameLineId);
      if (!gl) continue;
      let won: boolean | null;
      if (gp.altLine != null && !gl.market.startsWith("MONEYLINE")) {
        won = gameLineResult(gl.market, gp.altLine, homeScore, awayScore);
      } else {
        won = gl.result;
      }
      if (won == null) continue;
      await db.update(gamePicks).set({ outcome: won ? "WIN" : "LOSS" }).where(eq(gamePicks.id, gp.id));
      if (won) await creditWin(gp.userId, gp.leagueId, gp.stake + calcProfit(gp.stake, gp.odds));
    }
  }

  // 5) Parlays touching this game: settle their legs for this game, then the
  // parlay itself — LOSS as soon as any leg loses, WIN once every leg has won
  if (propIds.length === 0 && lineIds.length === 0) return;
  const touchingLegs = await db.query.parlayLegs.findMany({
    where: and(
      eq(parlayLegs.outcome, "PENDING"),
      or(
        propIds.length > 0 ? inArray(parlayLegs.propId, propIds) : sql`false`,
        lineIds.length > 0 ? inArray(parlayLegs.gameLineId, lineIds) : sql`false`,
      ),
    ),
  });
  const touchedParlayIds = [...new Set(touchingLegs.map((l) => l.parlayId))];
  if (touchedParlayIds.length === 0) return;

  for (const leg of touchingLegs) {
    let legResult: boolean | null = null;
    if (leg.propId) {
      const prop = propById.get(leg.propId);
      if (prop && prop.result != null) {
        const effectiveLine = leg.altLine ?? prop.line;
        legResult = (leg.direction === "OVER" && prop.result > effectiveLine) ||
                    (leg.direction === "UNDER" && prop.result < effectiveLine);
      }
    } else if (leg.gameLineId) {
      const gl = lineById.get(leg.gameLineId);
      if (gl && homeScore != null && awayScore != null) {
        legResult = leg.altLine != null && !gl.market.startsWith("MONEYLINE")
          ? gameLineResult(gl.market, leg.altLine, homeScore, awayScore)
          : gl.result;
      }
    }
    if (legResult == null) continue;
    await db.update(parlayLegs).set({ outcome: legResult ? "WIN" : "LOSS" }).where(eq(parlayLegs.id, leg.id));
  }

  const touchedParlays = await db.query.parlays.findMany({
    where: and(eq(parlays.outcome, "PENDING"), inArray(parlays.id, touchedParlayIds)),
    with: { legs: true },
  });
  for (const parlay of touchedParlays) {
    const legs = (parlay as any).legs as any[];
    const anyLoss = legs.some((l) => l.outcome === "LOSS");
    const allWon = legs.every((l) => l.outcome === "WIN");
    if (anyLoss) {
      await db.update(parlays).set({ outcome: "LOSS" }).where(eq(parlays.id, parlay.id));
    } else if (allWon) {
      await db.update(parlays).set({ outcome: "WIN" }).where(eq(parlays.id, parlay.id));
      await creditWin(parlay.userId, parlay.leagueId, parlay.payout);
    }
  }
}

// Called after each live-score sync: settle every FINAL game in the week that
// still has pending money on it (bets or parlay legs). Cheap when nothing is
// pending, and self-healing if the server restarts between FINAL and settle.
export async function settlePendingBetsOnFinalGames(weekId: string): Promise<void> {
  const finalGames = await db.query.games.findMany({
    where: and(eq(games.weekId, weekId), eq(games.status, "FINAL")),
    columns: { id: true },
  });
  if (finalGames.length === 0) return;
  const finalIds = finalGames.map((g) => g.id);

  const [pendingPickGames, pendingGamePickGames, pendingPropLegGames, pendingLineLegGames] = await Promise.all([
    db.selectDistinct({ gameId: props.gameId })
      .from(picks)
      .innerJoin(props, eq(picks.propId, props.id))
      .where(and(eq(picks.outcome, "PENDING"), inArray(props.gameId, finalIds))),
    db.selectDistinct({ gameId: gameLines.gameId })
      .from(gamePicks)
      .innerJoin(gameLines, eq(gamePicks.gameLineId, gameLines.id))
      .where(and(eq(gamePicks.outcome, "PENDING"), inArray(gameLines.gameId, finalIds))),
    db.selectDistinct({ gameId: props.gameId })
      .from(parlayLegs)
      .innerJoin(props, eq(parlayLegs.propId, props.id))
      .where(and(eq(parlayLegs.outcome, "PENDING"), inArray(props.gameId, finalIds))),
    db.selectDistinct({ gameId: gameLines.gameId })
      .from(parlayLegs)
      .innerJoin(gameLines, eq(parlayLegs.gameLineId, gameLines.id))
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
