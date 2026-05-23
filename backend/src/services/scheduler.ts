import cron from "node-cron";
import { prisma } from "../db/prisma";
import { resolveWeekById } from "./resolveWeek";
import { syncESPNGames, syncOdds, syncScores } from "./syncWeek";
import { distributeWeeklyAllowances } from "./distributeAllowances";
import { startLeagueSeason } from "./startSeason";

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
  const pastUnresolved = await prisma.week.findMany({
    where: { resolved: false, endDate: { lt: now } },
    orderBy: { number: "asc" },
  });

  for (const week of pastUnresolved) {
    try {
      await resolveWeekById(week.id);
    } catch (err) {
      console.error(`[cron] Failed to resolve week ${week.number}:`, err);
    }

    // Distribute allowances for the next week after resolving
    const nextWeek = await prisma.week.findFirst({
      where: { number: week.number + 1, allowanceDistributed: false },
    });
    if (nextWeek) {
      try {
        await distributeWeeklyAllowances(nextWeek.number);
        await prisma.week.update({ where: { id: nextWeek.id }, data: { allowanceDistributed: true } });
      } catch (err) {
        console.error(`[cron] Failed to distribute allowances for week ${nextWeek.number}:`, err);
      }
    }
  }
}

async function runAutoStartLeagues(weekNumber: number) {
  const leagues = await prisma.league.findMany({
    where: { startWeek: weekNumber, seasonStarted: false },
    include: { memberships: { where: { status: "ACTIVE" }, select: { id: true } } },
  }) as any[];

  for (const league of leagues) {
    if (league.memberships.length < 2) {
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

async function runESPNGameSync() {
  const now = new Date();
  const upcoming = await prisma.week.findFirst({
    where: { startDate: { gt: now } },
    orderBy: { number: "asc" },
  });
  if (!upcoming) { console.log("[cron] No upcoming week to sync"); return; }
  try {
    await syncESPNGames(upcoming.id);
  } catch (err) {
    console.error(`[cron] ESPN game sync failed for week ${upcoming.number}:`, err);
  }
  await runAutoStartLeagues(upcoming.number);
}

async function runOddsSync() {
  const now = new Date();
  // Sync both the current week and the upcoming week
  const weeks = await prisma.week.findMany({
    where: {
      resolved: false,
      OR: [
        { startDate: { lte: now }, endDate: { gte: now } },
        { startDate: { gt: now } },
      ],
    },
    orderBy: { number: "asc" },
    take: 2,
  });
  for (const week of weeks) {
    try {
      await syncOdds(week.id);
    } catch (err) {
      console.error(`[cron] Odds sync failed for week ${week.number}:`, err);
    }
  }
}

async function runScoreSync() {
  const now = new Date();
  const week = await prisma.week.findFirst({
    where: { resolved: false, startDate: { lte: now }, endDate: { gte: now } },
    orderBy: { number: "asc" },
    include: { games: { select: { gameDate: true, status: true } } },
  });
  if (!week) return;

  // Only call ESPN if at least one game has kicked off but isn't done yet
  const hasActiveGame = (week as any).games.some(
    (g: any) => new Date(g.gameDate) <= now && g.status !== "FINAL" && g.status !== "CANCELLED"
  );
  if (!hasActiveGame) return;

  try {
    await syncScores(week.id);
  } catch (err) {
    console.error(`[cron] Score sync failed for week ${week.number}:`, err);
  }
}

export function startScheduler() {
  cron.schedule(RESOLVE_SCHEDULE,    runResolveAndAllowances, { timezone: "UTC" });
  cron.schedule(GAME_SYNC_SCHEDULE,  runESPNGameSync,         { timezone: "UTC" });
  cron.schedule(ODDS_SYNC_SCHEDULE,  runOddsSync,             { timezone: "UTC" });
  cron.schedule(ODDS_REFRESH_SCHEDULE, runOddsSync,           { timezone: "UTC" });
  cron.schedule(SCORE_SYNC_SCHEDULE, runScoreSync,            { timezone: "UTC" });
  console.log("[scheduler] Cron jobs registered");
}
