import cron from "node-cron";
import { db } from "../db/db";
import { eq, and, lt, gt, lte, gte } from "drizzle-orm";
import { weeks, leagues } from "../db/schema";
import { resolveWeekById } from "./resolveWeek";
import { syncESPNGames, syncOddsAllWeeks, syncScores } from "./syncWeek";
import { getNFLWeekDates, nflYear } from "./espnApi";
import { distributeWeeklyAllowances } from "./distributeAllowances";
import { startLeagueSeason } from "./startSeason";
import { settlePendingBetsOnFinalGames } from "./settleGame";

// Tuesday 11:00 AM UTC — resolve last week, distribute allowances for new week
const RESOLVE_SCHEDULE = "0 11 * * 2";
// Tuesday 6:00 PM UTC — sync ESPN games for upcoming week
const GAME_SYNC_SCHEDULE = "0 18 * * 2";
// Wednesday 2:00 PM UTC — sync odds for upcoming week
const ODDS_SYNC_SCHEDULE = "0 14 * * 3";
// Friday 2:00 PM UTC — re-sync odds (line movements)
const ODDS_REFRESH_SCHEDULE = "0 14 * * 5";
// Every minute — sync scores only when a game has kicked off but isn't final yet
const SCORE_SYNC_SCHEDULE = "* * * * *";

async function runResolveAndAllowances() {
  const now = new Date();
  const pastUnresolved = await db.query.weeks.findMany({
    where: (w, { and, eq, lt }) => and(eq(w.resolved, false), lt(w.endDate, now)),
    orderBy: (w, { asc }) => [asc(w.number)],
  });

  for (const week of pastUnresolved) {
    try {
      await resolveWeekById(week.id);
    } catch (err) {
      console.error(`[cron] Failed to resolve week ${week.number}:`, err);
    }

    // Distribute allowances for the next week after resolving
    const nextWeek = await db.query.weeks.findFirst({
      where: (w, { and, eq }) => and(eq(w.number, week.number + 1), eq(w.allowanceDistributed, false)),
    });
    if (nextWeek) {
      try {
        await distributeWeeklyAllowances(nextWeek.number);
        await db.update(weeks)
          .set({ allowanceDistributed: true })
          .where(eq(weeks.id, nextWeek.id));
      } catch (err) {
        console.error(`[cron] Failed to distribute allowances for week ${nextWeek.number}:`, err);
      }
    }
  }
}

async function runAutoStartLeagues(weekNumber: number) {
  const leagueList = await db.query.leagues.findMany({
    where: (l, { and, eq }) => and(eq(l.startWeek, weekNumber), eq(l.seasonStarted, false)),
    with: { memberships: true },
  });

  for (const league of leagueList) {
    const activeMembers = (league.memberships as any[]).filter((m: any) => m.status === "ACTIVE");
    if (activeMembers.length < 2) {
      console.log(`[cron] Skipping auto-start for league ${league.id} — fewer than 2 members`);
      continue;
    }
    try {
      await startLeagueSeason(league.id);
      console.log(`[cron] Auto-started league ${league.id} for week ${weekNumber}`);
    } catch (err) {
      console.error(`[cron] Failed to auto-start league ${league.id}:`, err);
    }
  }
}

const MAX_NFL_WEEK = 17;

async function runESPNGameSync() {
  const now = new Date();

  // Determine which week to sync: existing upcoming week, or next after the latest in DB
  const upcoming = await db.query.weeks.findFirst({
    where: (w, { gt }) => gt(w.startDate, now),
    orderBy: (w, { asc }) => [asc(w.number)],
  });

  let weekNumber: number;
  if (upcoming) {
    weekNumber = upcoming.number;
  } else {
    const latest = await db.query.weeks.findFirst({
      orderBy: (w, { desc }) => [desc(w.number)],
    });
    weekNumber = latest ? latest.number + 1 : 1;
  }

  if (weekNumber > MAX_NFL_WEEK) {
    console.log("[cron] Season complete, no weeks to sync");
    return;
  }

  // Fetch week date range from ESPN and upsert the Week row
  const year = nflYear(now);
  const weekDates = await getNFLWeekDates(weekNumber, year);
  if (!weekDates) {
    console.log(`[cron] ESPN returned no games for week ${weekNumber} ${year}`);
    return;
  }

  const existing = await db.query.weeks.findFirst({
    where: (w, { eq }) => eq(w.number, weekNumber),
  });
  let week: typeof existing;
  if (existing) {
    [week] = await db.update(weeks)
      .set({ startDate: weekDates.startDate, endDate: weekDates.endDate })
      .where(eq(weeks.number, weekNumber))
      .returning();
  } else {
    [week] = await db.insert(weeks)
      .values({ number: weekNumber, startDate: weekDates.startDate, endDate: weekDates.endDate })
      .returning();
  }

  try {
    await syncESPNGames(week!.id);
  } catch (err) {
    console.error(`[cron] ESPN game sync failed for week ${week!.number}:`, err);
  }
  await runAutoStartLeagues(week!.number);
}

async function runOddsSync() {
  // One SharpAPI fetch covers every unresolved week (lines post months ahead)
  try {
    await syncOddsAllWeeks();
  } catch (err) {
    console.error("[cron] Odds sync failed:", err);
  }
}

async function runScoreSync() {
  const now = new Date();
  const week = await db.query.weeks.findFirst({
    where: (w, { and, eq, lte, gte }) =>
      and(eq(w.resolved, false), lte(w.startDate, now), gte(w.endDate, now)),
    orderBy: (w, { asc }) => [asc(w.number)],
    with: { games: true },
  });
  if (!week) return;

  // Only call ESPN if at least one game has kicked off but isn't done yet
  const hasActiveGame = ((week as any).games as any[]).some(
    (g: any) => new Date(g.gameDate) <= now && g.status !== "FINAL" && g.status !== "CANCELLED"
  );

  try {
    if (hasActiveGame) await syncScores(week.id);
    // Settle bets on any game that has gone FINAL so winnings are re-bettable
    // on later games in the same week (runs even after the last game finishes,
    // so a settle missed during a restart still lands before Tuesday's resolve)
    await settlePendingBetsOnFinalGames(week.id);
  } catch (err) {
    console.error(`[cron] Score sync failed for week ${week.number}:`, err);
  }
}

export function startScheduler() {
  cron.schedule(RESOLVE_SCHEDULE,      runResolveAndAllowances, { timezone: "UTC" });
  cron.schedule(GAME_SYNC_SCHEDULE,    runESPNGameSync,         { timezone: "UTC" });
  cron.schedule(ODDS_SYNC_SCHEDULE,    runOddsSync,             { timezone: "UTC" });
  cron.schedule(ODDS_REFRESH_SCHEDULE, runOddsSync,             { timezone: "UTC" });
  cron.schedule(SCORE_SYNC_SCHEDULE,   runScoreSync,            { timezone: "UTC" });
  console.log("[scheduler] Cron jobs registered");
}
