import { db } from "../db/db";
import { eq, and, isNull, inArray } from "drizzle-orm";
import { weeks, games, gameLines, players, props } from "../db/schema";
import { getNFLWeekGames } from "./espnApi";
import { getNFLWeekData, NFLGameData } from "./sharpApi";
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
  touchdowns: "TOUCHDOWNS",
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
      .values({
        weekId: week.id, homeTeam: g.homeTeam, awayTeam: g.awayTeam, gameDate: g.gameDate, espnId: g.espnId,
        indoor: g.indoor, weather: g.weather, weatherTemp: g.weatherTemp,
        homeRecord: g.homeRecord, awayRecord: g.awayRecord,
      })
      .onConflictDoUpdate({
        target: games.espnId,
        set: {
          homeTeam: g.homeTeam, awayTeam: g.awayTeam, gameDate: g.gameDate,
          indoor: g.indoor, weather: g.weather, weatherTemp: g.weatherTemp,
          homeRecord: g.homeRecord, awayRecord: g.awayRecord,
        },
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
        indoor: g.indoor,
        // Weather only appears inside 10 days of kickoff, so this minute-by-minute
        // sync is what actually fills it in. Only written when ESPN has a value —
        // otherwise a far-out game would keep nulling a forecast we already had,
        // and ESPN drops weather again once the game is FINAL.
        ...(g.weather != null ? { weather: g.weather, weatherTemp: g.weatherTemp } : {}),
        // Same guard as weather: only overwrite when ESPN actually has a
        // record, so a null response can't wipe one we already stored.
        ...(g.homeRecord != null ? { homeRecord: g.homeRecord } : {}),
        ...(g.awayRecord != null ? { awayRecord: g.awayRecord } : {}),
      })
      .where(eq(games.espnId, g.espnId));
    updated++;
  }
  console.log(`[sync] Scores for week ${week.number}: ${updated} updated`);
  return { updated };
}

async function applyOddsToWeek(
  week: { id: string; number: number; startDate: Date; endDate: Date },
  allData: NFLGameData[],
): Promise<{ games: number; lines: number; props: number }> {
  // 24h buffer on the start — SharpAPI kickoff times can sit minutes before
  // the ESPN-derived week start; adjacent weeks stay >1 day apart regardless
  const start = new Date(new Date(week.startDate).getTime() - 24 * 3600 * 1000);
  const end = new Date(week.endDate);
  const inRange = allData.filter(({ commenceTime }) => {
    const d = new Date(commenceTime);
    return d >= start && d <= end;
  });

  // Match SharpAPI events to games already created by the ESPN sync —
  // both sides use the same team abbreviations (KC, BUF…)
  const weekGames = await db.select().from(games).where(eq(games.weekId, week.id));
  const byMatchup = new Map(weekGames.map((g) => [`${g.awayTeam}@${g.homeTeam}`, g]));

  let gamesSynced = 0, linesSynced = 0, propsSynced = 0;
  for (const { eventId, commenceTime, homeTeam, awayTeam, lines, props: rawProps } of inRange) {
    let game = byMatchup.get(`${awayTeam}@${homeTeam}`);
    if (!game) {
      [game] = await db.insert(games)
        .values({ weekId: week.id, homeTeam, awayTeam, gameDate: new Date(commenceTime), externalId: eventId })
        .onConflictDoUpdate({
          target: games.externalId,
          set: { homeTeam, awayTeam, gameDate: new Date(commenceTime) },
        })
        .returning();
      byMatchup.set(`${awayTeam}@${homeTeam}`, game);
    } else if (!game.externalId) {
      await db.update(games).set({ externalId: eventId }).where(eq(games.id, game.id));
    }
    // Never move lines on a game that has kicked off
    if (new Date(game.gameDate) <= new Date()) continue;
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
        await db.update(props).set({ line: raw.line, odds: raw.odds }).where(eq(props.id, existing.id));
      } else {
        await db.insert(props).values({ gameId: game.id, playerId: player!.id, statType: statType as any, line: raw.line, odds: raw.odds });
      }
      propsSynced++;
    }
  }

  console.log(`[sync] Odds for week ${week.number}: ${gamesSynced} games, ${linesSynced} lines, ${propsSynced} props`);
  return { games: gamesSynced, lines: linesSynced, props: propsSynced };
}

export async function syncOdds(weekId: string): Promise<{ games: number; lines: number; props: number }> {
  const week = await db.query.weeks.findFirst({ where: eq(weeks.id, weekId) });
  if (!week) throw new Error("Week not found");
  const allData = await getNFLWeekData();
  return applyOddsToWeek(week, allData);
}

// One SharpAPI fetch applied across every unresolved week — SharpAPI posts
// lines months ahead, and the 12 req/min cap makes per-week fetches wasteful
export async function syncOddsAllWeeks(): Promise<{ weeks: number; games: number; lines: number; props: number }> {
  const weekList = await db.query.weeks.findMany({
    where: (w, { eq }) => eq(w.resolved, false),
    orderBy: (w, { asc }) => [asc(w.number)],
  });
  if (weekList.length === 0) return { weeks: 0, games: 0, lines: 0, props: 0 };

  const allData = await getNFLWeekData();
  let gamesSynced = 0, linesSynced = 0, propsSynced = 0;
  for (const week of weekList) {
    const r = await applyOddsToWeek(week, allData);
    gamesSynced += r.games;
    linesSynced += r.lines;
    propsSynced += r.props;
  }
  return { weeks: weekList.length, games: gamesSynced, lines: linesSynced, props: propsSynced };
}
