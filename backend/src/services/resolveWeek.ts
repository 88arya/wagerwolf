import { db } from "../db/db";
import { eq, and, lt, isNull } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { weeks, games, gameLines, picks, gamePicks, parlays, parlayLegs, props, memberships, matchups } from "../db/schema";
import { getGameStats } from "./espnApi";
import { calcProfit } from "../lib/payout";
import { triggerPostWeekActions } from "./autoPlayoffs";

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

export async function resolveWeekById(weekId: string): Promise<{
  propsMatched: number; propsUnmatched: number;
  gameLinesMatched: number; gameLinesUnmatched: number;
}> {
  const week = await db.query.weeks.findFirst({
    where: eq(weeks.id, weekId),
    with: { games: { with: { props: { with: { player: true } }, gameLines: true } } },
  });

  if (!week) throw new Error("Week not found");
  if (week.resolved) throw new Error("Week already resolved");

  const weekGames = (week as any).games as any[];

  // Fetch ESPN box scores
  const masterStats = new Map<string, any>();
  for (const game of weekGames) {
    if (!game.espnId) continue;
    const gameStats = await getGameStats(game.espnId);
    for (const [name, stats] of gameStats) {
      masterStats.set(name.toLowerCase(), stats);
    }
  }

  // Resolve game lines
  let glMatched = 0, glUnmatched = 0;
  for (const game of weekGames) {
    if (!game.gameLines?.length) continue;
    let homeScore: number | null = null;
    let awayScore: number | null = null;

    if (game.espnId) {
      try {
        const summaryRes = await fetch(
          `https://site.api.espn.com/apis/site/v2/sports/football/nfl/summary?event=${game.espnId}`
        );
        const summary = await summaryRes.json();
        const competitors = summary?.header?.competitions?.[0]?.competitors ?? [];
        for (const c of competitors) {
          const score = parseInt(c.score, 10);
          if (c.homeAway === "home") homeScore = score;
          else awayScore = score;
        }
      } catch { /* skip */ }
    } else if (game.homeScore != null && game.awayScore != null) {
      homeScore = game.homeScore;
      awayScore = game.awayScore;
    }

    if (homeScore == null || awayScore == null) { glUnmatched += game.gameLines.length; continue; }

    await db.update(games)
      .set({ homeScore, awayScore, status: "FINAL" })
      .where(eq(games.id, game.id));

    for (const gl of game.gameLines) {
      if (gl.result != null) { glMatched++; continue; }
      let result: boolean | null = null;
      switch (gl.market) {
        case "MONEYLINE_HOME": result = homeScore > awayScore; break;
        case "MONEYLINE_AWAY": result = awayScore > homeScore; break;
        case "SPREAD_HOME":    result = gl.line != null ? (homeScore + gl.line) > awayScore : null; break;
        case "SPREAD_AWAY":    result = gl.line != null ? (awayScore + gl.line) > homeScore : null; break;
        case "TOTAL_OVER":     result = gl.line != null ? (homeScore + awayScore) > gl.line : null; break;
        case "TOTAL_UNDER":    result = gl.line != null ? (homeScore + awayScore) < gl.line : null; break;
      }
      if (result == null) { glUnmatched++; continue; }
      await db.update(gameLines).set({ result }).where(eq(gameLines.id, gl.id));
      glMatched++;
    }
  }

  // Resolve game picks
  const pendingGamePicks = await db.query.gamePicks.findMany({
    where: eq(gamePicks.outcome, "PENDING"),
    with: { gameLine: { with: { game: true } } },
  });
  // Filter to picks whose game is in this week
  const weekGameIds = new Set(weekGames.map((g: any) => g.id));
  const filteredGamePicks = pendingGamePicks.filter(
    (gp) => gp.gameLine && weekGameIds.has((gp as any).gameLine.gameId)
  );

  for (const gp of filteredGamePicks) {
    const gl = (gp as any).gameLine;
    const gameRow = gl.game;
    let won: boolean;
    if (gp.altLine != null) {
      const { homeScore, awayScore } = gameRow;
      if (homeScore == null || awayScore == null) continue;
      switch (gl.market) {
        case "SPREAD_HOME": won = (homeScore + gp.altLine) > awayScore; break;
        case "SPREAD_AWAY": won = (awayScore + gp.altLine) > homeScore; break;
        case "TOTAL_OVER":  won = (homeScore + awayScore) > gp.altLine; break;
        case "TOTAL_UNDER": won = (homeScore + awayScore) < gp.altLine; break;
        default: if (gl.result == null) continue; won = gl.result; break;
      }
    } else {
      if (gl.result == null) continue;
      won = gl.result === true;
    }
    const profit = won ? calcProfit(gp.stake, gp.odds) : 0;
    await db.transaction(async (tx) => {
      await tx.update(gamePicks)
        .set({ outcome: won ? "WIN" : "LOSS" })
        .where(eq(gamePicks.id, gp.id));
      if (won) {
        await tx.update(memberships)
          .set({ balance: sql`${memberships.balance} + ${gp.stake + profit}` })
          .where(and(eq(memberships.userId, gp.userId), eq(memberships.leagueId, gp.leagueId)));
      }
    });
  }

  // Resolve prop results
  let propMatched = 0, propUnmatched = 0;
  for (const game of weekGames) {
    for (const prop of (game.props as any[])) {
      if (prop.result != null) { propMatched++; continue; }
      const playerStats = masterStats.get(prop.player.name.toLowerCase());
      if (!playerStats) { propUnmatched++; continue; }
      const statKey = STAT_FIELD[prop.statType as string];
      if (!statKey) { propUnmatched++; continue; }
      const result = (playerStats as any)[statKey] ?? null;
      if (result == null) { propUnmatched++; continue; }
      await db.update(props).set({ result }).where(eq(props.id, prop.id));
      propMatched++;
    }
  }

  // Resolve prop picks
  const pendingPicks = await db.query.picks.findMany({
    where: eq(picks.outcome, "PENDING"),
    with: { prop: true },
  });
  // Filter to picks whose prop is in a game from this week
  const propGameIds = new Set(weekGames.map((g: any) => g.id));
  const filteredPicks = pendingPicks.filter((pk) => propGameIds.has((pk as any).prop?.gameId));

  for (const pick of filteredPicks) {
    const prop = (pick as any).prop;
    const { result } = prop;
    if (result == null) continue;
    const effectiveLine = pick.altLine ?? prop.line;
    const won = (pick.direction === "OVER" && result > effectiveLine) ||
                (pick.direction === "UNDER" && result < effectiveLine);
    const profit = won ? calcProfit(pick.stake, pick.odds) : 0;
    await db.transaction(async (tx) => {
      await tx.update(picks)
        .set({ outcome: won ? "WIN" : "LOSS" })
        .where(eq(picks.id, pick.id));
      if (won) {
        await tx.update(memberships)
          .set({ balance: sql`${memberships.balance} + ${pick.stake + profit}` })
          .where(and(eq(memberships.userId, pick.userId), eq(memberships.leagueId, pick.leagueId)));
      }
    });
  }

  // Resolve parlays
  const pendingParlays = await db.query.parlays.findMany({
    where: eq(parlays.outcome, "PENDING"),
    with: { legs: { with: { prop: true, gameLine: { with: { game: true } } } } },
  });

  for (const parlay of pendingParlays) {
    const parlayLegsData = (parlay as any).legs as any[];
    let allSettled = true;
    let anyLoss = false;
    for (const leg of parlayLegsData) {
      if (leg.outcome !== "PENDING") continue;
      let legResult: boolean | null = null;
      if (leg.prop && leg.prop.result != null) {
        const effectiveLine = leg.altLine ?? leg.prop.line;
        legResult = (leg.direction === "OVER" && leg.prop.result > effectiveLine) ||
                    (leg.direction === "UNDER" && leg.prop.result < effectiveLine);
      } else if (leg.gameLine) {
        if (leg.altLine != null) {
          const { homeScore, awayScore } = leg.gameLine.game ?? {};
          if (homeScore == null || awayScore == null) { allSettled = false; continue; }
          switch (leg.gameLine.market) {
            case "SPREAD_HOME": legResult = (homeScore + leg.altLine) > awayScore; break;
            case "SPREAD_AWAY": legResult = (awayScore + leg.altLine) > homeScore; break;
            case "TOTAL_OVER":  legResult = (homeScore + awayScore) > leg.altLine; break;
            case "TOTAL_UNDER": legResult = (homeScore + awayScore) < leg.altLine; break;
            default: if (leg.gameLine.result != null) legResult = leg.gameLine.result; break;
          }
        } else if (leg.gameLine.result != null) {
          legResult = leg.gameLine.result === true;
        }
      }
      if (legResult == null) { allSettled = false; continue; }
      await db.update(parlayLegs)
        .set({ outcome: legResult ? "WIN" : "LOSS" })
        .where(eq(parlayLegs.id, leg.id));
      if (!legResult) anyLoss = true;
    }
    if (!allSettled) continue;
    const parlayWon = !anyLoss;
    await db.transaction(async (tx) => {
      await tx.update(parlays)
        .set({ outcome: parlayWon ? "WIN" : "LOSS" })
        .where(eq(parlays.id, parlay.id));
      if (parlayWon) {
        await tx.update(memberships)
          .set({ balance: sql`${memberships.balance} + ${parlay.payout}` })
          .where(and(eq(memberships.userId, parlay.userId), eq(memberships.leagueId, parlay.leagueId)));
      }
    });
  }

  // Floor negative balances
  await db.update(memberships)
    .set({ balance: 0 })
    .where(lt(memberships.balance, 0));

  // Mark week resolved
  await db.update(weeks)
    .set({ resolved: true, locked: true })
    .where(eq(weeks.id, weekId));

  // Resolve matchups using ending balance — the balance already includes the
  // week's untouched allowance, so it IS each member's score for the week
  const pendingMatchups = await db.query.matchups.findMany({
    where: (m, { and, eq, isNull }) =>
      and(eq(m.weekNumber, week.number), isNull(m.winnerId), eq(m.isTie, false)),
  });

  const leagueMeanCache: Record<string, number> = {};
  for (const matchup of pendingMatchups) {
    const [homeMem, awayMem] = await Promise.all([
      db.query.memberships.findFirst({
        where: (m, { and, eq }) =>
          and(eq(m.userId, matchup.homeUserId), eq(m.leagueId, matchup.leagueId)),
      }),
      db.query.memberships.findFirst({
        where: (m, { and, eq }) =>
          and(eq(m.userId, matchup.awayUserId), eq(m.leagueId, matchup.leagueId)),
      }),
    ]);

    let homeProfit = homeMem?.balance ?? 0;
    let awayProfit = awayMem?.balance ?? 0;

    if (matchup.isGhostMatchup) {
      if (!(matchup.leagueId in leagueMeanCache)) {
        const mems = await db.query.memberships.findMany({
          where: (m, { and, eq }) =>
            and(eq(m.leagueId, matchup.leagueId), eq(m.status, "ACTIVE")),
        });
        leagueMeanCache[matchup.leagueId] = mems.length > 0
          ? mems.reduce((s, m) => s + m.balance, 0) / mems.length
          : 0;
      }
      const mean = leagueMeanCache[matchup.leagueId];
      if (!homeMem) homeProfit = mean;
      if (!awayMem) awayProfit = mean;
    }

    const isTie = homeProfit === awayProfit;
    const winnerId = isTie ? null : homeProfit > awayProfit ? matchup.homeUserId : matchup.awayUserId;
    await db.update(matchups)
      .set({ homeProfit, awayProfit, winnerId, isTie })
      .where(eq(matchups.id, matchup.id));
  }

  // Trigger playoff check after matchups are resolved
  await triggerPostWeekActions(week.number);

  console.log(`[resolve] Week ${week.number} resolved — props: ${propMatched}/${propMatched + propUnmatched}, lines: ${glMatched}/${glMatched + glUnmatched}`);
  return { propsMatched: propMatched, propsUnmatched: propUnmatched, gameLinesMatched: glMatched, gameLinesUnmatched: glUnmatched };
}
