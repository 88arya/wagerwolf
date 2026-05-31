import { StatType } from "@prisma/client";
import { prisma } from "../db/prisma";
import { getNFLWeekGames } from "./espnApi";
import { getNFLWeekData } from "./oddsApi";
import { seedFakePropsForWeek } from "./fakeSync";

const MARKET_TO_STAT: Record<string, StatType> = {
  passing_yards: StatType.PASSING_YARDS,
  passing_touchdowns: StatType.PASSING_TOUCHDOWNS,
  passing_completions: StatType.PASSING_COMPLETIONS,
  passing_attempts: StatType.PASSING_ATTEMPTS,
  passing_interceptions: StatType.PASSING_INTERCEPTIONS,
  passing_longest: StatType.PASSING_LONGEST,
  rushing_yards: StatType.RUSHING_YARDS,
  rushing_touchdowns: StatType.RUSHING_TOUCHDOWNS,
  rushing_attempts: StatType.RUSHING_ATTEMPTS,
  rushing_longest: StatType.RUSHING_LONGEST,
  receiving_yards: StatType.RECEIVING_YARDS,
  receiving_touchdowns: StatType.RECEIVING_TOUCHDOWNS,
  receiving_longest: StatType.RECEIVING_LONGEST,
  receiving_targets: StatType.RECEIVING_TARGETS,
  receptions: StatType.RECEPTIONS,
  sacks: StatType.SACKS,
  tackles_assists: StatType.TACKLES_ASSISTS,
  interceptions: StatType.DEFENSIVE_INTERCEPTIONS,
  field_goals_made: StatType.FIELD_GOALS_MADE,
  field_goal_longest: StatType.FIELD_GOAL_LONGEST,
  kicking_points: StatType.KICKING_POINTS,
  extra_points_made: StatType.EXTRA_POINTS_MADE,
};

const MARKET_TO_POSITION: Record<string, string> = {
  passing_yards: "QB", passing_touchdowns: "QB", passing_completions: "QB",
  passing_attempts: "QB", passing_interceptions: "QB", passing_longest: "QB",
  rushing_yards: "RB", rushing_touchdowns: "RB", rushing_attempts: "RB", rushing_longest: "RB",
  receiving_yards: "WR", receiving_touchdowns: "WR", receiving_longest: "WR",
  receiving_targets: "WR", receptions: "WR",
  sacks: "DE", tackles_assists: "LB", interceptions: "CB",
  field_goals_made: "K", field_goal_longest: "K", kicking_points: "K", extra_points_made: "K",
};

export async function syncESPNGames(weekId: string): Promise<{ synced: number }> {
  const week = await prisma.week.findUnique({ where: { id: weekId } });
  if (!week) throw new Error("Week not found");

  const espnGames = await getNFLWeekGames(new Date(week.startDate), week.number);
  let synced = 0;
  for (const g of espnGames) {
    await prisma.game.upsert({
      where: { espnId: g.espnId },
      update: { gameDate: g.gameDate },
      create: { weekId: week.id, homeTeam: g.homeTeam, awayTeam: g.awayTeam, gameDate: g.gameDate, espnId: g.espnId },
    });
    synced++;
  }

  await seedFakePropsForWeek(weekId);
  console.log(`[sync] ESPN games for week ${week.number}: ${synced} games`);
  return { synced };
}

export async function syncScores(weekId: string): Promise<{ updated: number }> {
  const week = await prisma.week.findUnique({ where: { id: weekId } });
  if (!week) throw new Error("Week not found");

  const espnGames = await getNFLWeekGames(new Date(week.startDate), week.number);
  let updated = 0;
  for (const g of espnGames) {
    const existing = await prisma.game.findUnique({ where: { espnId: g.espnId } });
    if (!existing) continue;
    await prisma.game.update({
      where: { espnId: g.espnId },
      data: {
        status: g.status,
        homeScore: g.homeScore,
        awayScore: g.awayScore,
        statusDetail: g.statusDetail,
      },
    });
    updated++;
  }
  console.log(`[sync] Scores for week ${week.number}: ${updated} updated`);
  return { updated };
}

export async function syncOdds(weekId: string): Promise<{ games: number; lines: number; props: number }> {
  const week = await prisma.week.findUnique({ where: { id: weekId } });
  if (!week) throw new Error("Week not found");

  const allData = await getNFLWeekData();
  const now = new Date();
  const start = new Date(week.startDate);
  const end = new Date(week.endDate);
  const inRange = allData.filter(({ commenceTime }: any) => {
    const d = new Date(commenceTime);
    return d >= start && d <= end && d > now;
  });

  let gamesSynced = 0, linesSynced = 0, propsSynced = 0;
  for (const { eventId, commenceTime, homeTeam, awayTeam, lines, props } of inRange) {
    const game = await prisma.game.upsert({
      where: { externalId: eventId },
      update: { homeTeam, awayTeam, gameDate: new Date(commenceTime) },
      create: { weekId: week.id, homeTeam, awayTeam, gameDate: new Date(commenceTime), externalId: eventId },
    });
    gamesSynced++;

    for (const raw of lines) {
      await prisma.gameLine.upsert({
        where: { gameId_market: { gameId: game.id, market: raw.market } },
        update: { label: raw.label, odds: raw.odds, line: raw.line },
        create: { gameId: game.id, market: raw.market, label: raw.label, odds: raw.odds, line: raw.line },
      });
      linesSynced++;
    }

    for (const raw of props) {
      const statType = MARKET_TO_STAT[raw.market];
      if (!statType) continue;
      let player = await prisma.player.findFirst({ where: { name: raw.playerName } });
      if (!player) {
        player = await prisma.player.create({
          data: { name: raw.playerName, team: "", position: MARKET_TO_POSITION[raw.market] ?? "FLEX" },
        });
      }
      const existing = await prisma.prop.findFirst({ where: { gameId: game.id, playerId: player.id, statType } });
      if (existing) {
        await prisma.prop.update({ where: { id: existing.id }, data: { line: raw.line } });
      } else {
        await prisma.prop.create({ data: { gameId: game.id, playerId: player.id, statType, line: raw.line } });
      }
      propsSynced++;
    }
  }

  console.log(`[sync] Odds for week ${week.number}: ${gamesSynced} games, ${linesSynced} lines, ${propsSynced} props`);
  return { games: gamesSynced, lines: linesSynced, props: propsSynced };
}
