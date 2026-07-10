import { db } from "../db/db";
import { eq, and, isNull, inArray } from "drizzle-orm";
import { weeks, games, gameLines, players, props } from "../db/schema";
import { getNFLWeekGames } from "./espnApi";
import { getNFLWeekData } from "./oddsApi";
import { seedFakePropsForWeek } from "./fakeSync";

const MARKET_TO_STAT: Record<string, string> = {
  passing_yards: "PASSING_YARDS",
  passing_touchdowns: "PASSING_TOUCHDOWNS",
  passing_completions: "PASSING_COMPLETIONS",
  passing_attempts: "PASSING_ATTEMPTS",
  passing_interceptions: "PASSING_INTERCEPTIONS",
  passing_longest: "PASSING_LONGEST",
  rushing_yards: "RUSHING_YARDS",
  rushing_touchdowns: "RUSHING_TOUCHDOWNS",
  rushing_attempts: "RUSHING_ATTEMPTS",
  rushing_longest: "RUSHING_LONGEST",
  receiving_yards: "RECEIVING_YARDS",
  receiving_touchdowns: "RECEIVING_TOUCHDOWNS",
  receiving_longest: "RECEIVING_LONGEST",
  receiving_targets: "RECEIVING_TARGETS",
  receptions: "RECEPTIONS",
  sacks: "SACKS",
  tackles_assists: "TACKLES_ASSISTS",
  interceptions: "DEFENSIVE_INTERCEPTIONS",
  field_goals_made: "FIELD_GOALS_MADE",
  field_goal_longest: "FIELD_GOAL_LONGEST",
  kicking_points: "KICKING_POINTS",
  extra_points_made: "EXTRA_POINTS_MADE",
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
  const week = await db.query.weeks.findFirst({ where: eq(weeks.id, weekId) });
  if (!week) throw new Error("Week not found");

  const espnGames = await getNFLWeekGames(new Date(week.startDate), week.number);
  if (espnGames.length === 0) {
    console.log(`[sync] ESPN no games for week ${week.number}`);
    return { synced: 0 };
  }

  // Delete fake games (null espnId) and their props/lines before inserting real ones
  const fakeGameRows = await db.select({ id: games.id }).from(games)
    .where(and(eq(games.weekId, weekId), isNull(games.espnId)));
  if (fakeGameRows.length > 0) {
    const fakeIds = fakeGameRows.map(g => g.id);
    await db.delete(props).where(inArray(props.gameId, fakeIds));
    await db.delete(gameLines).where(inArray(gameLines.gameId, fakeIds));
    await db.delete(games).where(inArray(games.id, fakeIds));
  }

  // Update week dates to match real ESPN schedule
  const times = espnGames.map(g => g.gameDate.getTime());
  const weekStart = new Date(Math.min(...times));
  const weekEnd = new Date(Math.max(...times));
  weekEnd.setHours(weekEnd.getHours() + 18);
  await db.update(weeks).set({ startDate: weekStart, endDate: weekEnd }).where(eq(weeks.id, weekId));

  let synced = 0;
  for (const g of espnGames) {
    await db.insert(games)
      .values({ weekId: week.id, homeTeam: g.homeTeam, awayTeam: g.awayTeam, gameDate: g.gameDate, espnId: g.espnId })
      .onConflictDoUpdate({
        target: games.espnId,
        set: { homeTeam: g.homeTeam, awayTeam: g.awayTeam, gameDate: g.gameDate },
      });
    synced++;
  }

  await seedFakePropsForWeek(weekId);
  console.log(`[sync] ESPN games for week ${week.number}: ${synced} synced`);
  return { synced };
}

export async function syncScores(weekId: string): Promise<{ updated: number }> {
  const week = await db.query.weeks.findFirst({ where: eq(weeks.id, weekId) });
  if (!week) throw new Error("Week not found");

  const espnGames = await getNFLWeekGames(new Date(week.startDate), week.number);
  let updated = 0;
  for (const g of espnGames) {
    const existing = await db.query.games.findFirst({ where: eq(games.espnId, g.espnId) });
    if (!existing) continue;
    await db.update(games)
      .set({
        status: g.status,
        homeScore: g.homeScore,
        awayScore: g.awayScore,
        statusDetail: g.statusDetail,
      })
      .where(eq(games.espnId, g.espnId));
    updated++;
  }
  console.log(`[sync] Scores for week ${week.number}: ${updated} updated`);
  return { updated };
}

export async function syncOdds(weekId: string): Promise<{ games: number; lines: number; props: number }> {
  const week = await db.query.weeks.findFirst({ where: eq(weeks.id, weekId) });
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
  for (const { eventId, commenceTime, homeTeam, awayTeam, lines, props: rawProps } of inRange) {
    const [game] = await db.insert(games)
      .values({ weekId: week.id, homeTeam, awayTeam, gameDate: new Date(commenceTime), externalId: eventId })
      .onConflictDoUpdate({
        target: games.externalId,
        set: { homeTeam, awayTeam, gameDate: new Date(commenceTime) },
      })
      .returning();
    gamesSynced++;

    for (const raw of lines) {
      await db.insert(gameLines)
        .values({ gameId: game.id, market: raw.market, label: raw.label, odds: raw.odds, line: raw.line })
        .onConflictDoUpdate({
          target: [gameLines.gameId, gameLines.market],
          set: { label: raw.label, odds: raw.odds, line: raw.line },
        });
      linesSynced++;
    }

    for (const raw of rawProps) {
      const statType = MARKET_TO_STAT[raw.market];
      if (!statType) continue;
      let player = await db.query.players.findFirst({ where: eq(players.name, raw.playerName) });
      if (!player) {
        [player] = await db.insert(players)
          .values({ name: raw.playerName, team: "", position: MARKET_TO_POSITION[raw.market] ?? "FLEX" })
          .returning();
      }
      const existing = await db.query.props.findFirst({
        where: (p, { and, eq }) => and(eq(p.gameId, game.id), eq(p.playerId, player!.id), eq(p.statType, statType as any)),
      });
      if (existing) {
        await db.update(props).set({ line: raw.line }).where(eq(props.id, existing.id));
      } else {
        await db.insert(props).values({ gameId: game.id, playerId: player!.id, statType: statType as any, line: raw.line });
      }
      propsSynced++;
    }
  }

  console.log(`[sync] Odds for week ${week.number}: ${gamesSynced} games, ${linesSynced} lines, ${propsSynced} props`);
  return { games: gamesSynced, lines: linesSynced, props: propsSynced };
}
