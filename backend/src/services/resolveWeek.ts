import { StatType } from "@prisma/client";
import { prisma } from "../db/prisma";
import { getGameStats } from "./espnApi";
import { calcProfit } from "../lib/payout";
import { triggerPostWeekActions } from "./autoPlayoffs";

const STAT_FIELD: Partial<Record<StatType, string>> = {
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
  const week = await prisma.week.findUnique({
    where: { id: weekId },
    include: { games: { include: { props: { include: { player: true } }, gameLines: true } } },
  }) as any;

  if (!week) throw new Error("Week not found");
  if (week.resolved) throw new Error("Week already resolved");

  // Fetch ESPN box scores
  const masterStats = new Map<string, any>();
  for (const game of week.games) {
    if (!game.espnId) continue;
    const gameStats = await getGameStats(game.espnId);
    for (const [name, stats] of gameStats) {
      masterStats.set(name.toLowerCase(), stats);
    }
  }

  // Resolve game lines
  let glMatched = 0, glUnmatched = 0;
  for (const game of week.games) {
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

    await prisma.game.update({ where: { id: game.id }, data: { homeScore, awayScore, status: "FINAL" } });

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
      await prisma.gameLine.update({ where: { id: gl.id }, data: { result } });
      glMatched++;
    }
  }

  // Resolve game picks
  const gamePicks = await prisma.gamePick.findMany({
    where: { outcome: "PENDING", gameLine: { game: { weekId } } },
    include: { gameLine: { include: { game: true } } },
  }) as any[];

  for (const gp of gamePicks) {
    let won: boolean;
    if (gp.altLine != null) {
      const { homeScore, awayScore } = gp.gameLine.game;
      if (homeScore == null || awayScore == null) continue;
      switch (gp.gameLine.market) {
        case "SPREAD_HOME": won = (homeScore + gp.altLine) > awayScore; break;
        case "SPREAD_AWAY": won = (awayScore + gp.altLine) > homeScore; break;
        case "TOTAL_OVER":  won = (homeScore + awayScore) > gp.altLine; break;
        case "TOTAL_UNDER": won = (homeScore + awayScore) < gp.altLine; break;
        default: if (gp.gameLine.result == null) continue; won = gp.gameLine.result; break;
      }
    } else {
      if (gp.gameLine.result == null) continue;
      won = gp.gameLine.result === true;
    }
    const profit = won ? calcProfit(gp.stake, gp.odds) : 0;
    await prisma.$transaction([
      prisma.gamePick.update({ where: { id: gp.id }, data: { outcome: won ? "WIN" : "LOSS" } }),
      prisma.membership.updateMany({
        where: { userId: gp.userId, leagueId: gp.leagueId },
        data: won
          ? { balance: { increment: gp.stake + profit }, weeklyWinnings: { increment: profit } }
          : { weeklyWinnings: { decrement: gp.stake } },
      }),
    ]);
  }

  // Resolve prop results
  let propMatched = 0, propUnmatched = 0;
  for (const game of week.games) {
    for (const prop of game.props) {
      if (prop.result != null) { propMatched++; continue; }
      const playerStats = masterStats.get(prop.player.name.toLowerCase());
      if (!playerStats) { propUnmatched++; continue; }
      const statKey = STAT_FIELD[prop.statType as StatType];
      if (!statKey) { propUnmatched++; continue; }
      const result = (playerStats as any)[statKey] ?? null;
      if (result == null) { propUnmatched++; continue; }
      await prisma.prop.update({ where: { id: prop.id }, data: { result } });
      propMatched++;
    }
  }

  // Resolve prop picks
  const picks = await prisma.pick.findMany({
    where: { outcome: "PENDING", prop: { game: { weekId } } },
    include: { prop: true },
  }) as any[];

  for (const pick of picks) {
    const { result } = pick.prop;
    if (result == null) continue;
    const won = (pick.direction === "OVER" && result > pick.prop.line) ||
                (pick.direction === "UNDER" && result < pick.prop.line);
    const profit = won ? calcProfit(pick.stake, pick.odds) : 0;
    await prisma.$transaction([
      prisma.pick.update({ where: { id: pick.id }, data: { outcome: won ? "WIN" : "LOSS" } }),
      prisma.membership.updateMany({
        where: { userId: pick.userId, leagueId: pick.leagueId },
        data: won
          ? { balance: { increment: pick.stake + profit }, weeklyWinnings: { increment: profit } }
          : { weeklyWinnings: { decrement: pick.stake } },
      }),
    ]);
  }

  // Resolve parlays
  const parlays = await prisma.parlay.findMany({
    where: { outcome: "PENDING", league: { memberships: { some: {} } } },
    include: { legs: { include: { prop: true, gameLine: { include: { game: true } } } } },
  }) as any[];

  for (const parlay of parlays) {
    let allSettled = true;
    let anyLoss = false;
    for (const leg of parlay.legs) {
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
      await prisma.parlayLeg.update({ where: { id: leg.id }, data: { outcome: legResult ? "WIN" : "LOSS" } });
      if (!legResult) anyLoss = true;
    }
    if (!allSettled) continue;
    const parlayWon = !anyLoss;
    const profit = parlayWon ? parlay.payout - parlay.stake : 0;
    await prisma.$transaction([
      prisma.parlay.update({ where: { id: parlay.id }, data: { outcome: parlayWon ? "WIN" : "LOSS" } }),
      prisma.membership.updateMany({
        where: { userId: parlay.userId, leagueId: parlay.leagueId },
        data: parlayWon
          ? { balance: { increment: parlay.payout }, weeklyWinnings: { increment: profit } }
          : { weeklyWinnings: { decrement: parlay.stake } },
      }),
    ]);
  }

  // Floor negative balances
  await prisma.membership.updateMany({ where: { balance: { lt: 0 } }, data: { balance: 0 } });

  // Mark week resolved
  await prisma.week.update({ where: { id: weekId }, data: { resolved: true, locked: true } });

  // Resolve matchups using weeklyWinnings
  const matchups = await prisma.matchup.findMany({
    where: { weekNumber: week.number, winnerId: null, isTie: false },
  }) as any[];

  const leagueMeanCache: Record<string, number> = {};
  for (const matchup of matchups) {
    const [homeMem, awayMem] = await Promise.all([
      prisma.membership.findUnique({
        where: { userId_leagueId: { userId: matchup.homeUserId, leagueId: matchup.leagueId } },
      }),
      prisma.membership.findUnique({
        where: { userId_leagueId: { userId: matchup.awayUserId, leagueId: matchup.leagueId } },
      }),
    ]);

    let homeProfit = homeMem?.weeklyWinnings ?? 0;
    let awayProfit = awayMem?.weeklyWinnings ?? 0;

    if (matchup.isGhostMatchup) {
      if (!(matchup.leagueId in leagueMeanCache)) {
        const mems = await prisma.membership.findMany({
          where: { leagueId: matchup.leagueId, status: "ACTIVE" },
          select: { weeklyWinnings: true },
        });
        leagueMeanCache[matchup.leagueId] = mems.length > 0
          ? mems.reduce((s: number, m: any) => s + m.weeklyWinnings, 0) / mems.length
          : 0;
      }
      const mean = leagueMeanCache[matchup.leagueId];
      if (!homeMem) homeProfit = mean;
      if (!awayMem) awayProfit = mean;
    }

    const isTie = homeProfit === awayProfit;
    const winnerId = isTie ? null : homeProfit > awayProfit ? matchup.homeUserId : matchup.awayUserId;
    await prisma.matchup.update({
      where: { id: matchup.id },
      data: { homeProfit, awayProfit, winnerId, isTie },
    });
  }

  // Trigger playoff check after matchups are resolved
  await triggerPostWeekActions(week.number);

  console.log(`[resolve] Week ${week.number} resolved — props: ${propMatched}/${propMatched + propUnmatched}, lines: ${glMatched}/${glMatched + glUnmatched}`);
  return { propsMatched: propMatched, propsUnmatched: propUnmatched, gameLinesMatched: glMatched, gameLinesUnmatched: glUnmatched };
}
