import cron from "node-cron";
import { prisma } from "../db/prisma";
import { resolveWeekById } from "./resolveWeek";
import { syncESPNGames, syncOdds } from "./syncWeek";
import { distributeWeeklyAllowances } from "./distributeAllowances";

// Tuesday 11:00 AM UTC — resolve last week, distribute allowances for new week
const RESOLVE_SCHEDULE = "0 11 * * 2";
// Tuesday 6:00 PM UTC — sync ESPN games for upcoming week
const GAME_SYNC_SCHEDULE = "0 18 * * 2";
// Wednesday 2:00 PM UTC — sync odds for upcoming week
const ODDS_SYNC_SCHEDULE = "0 14 * * 3";
// Friday 2:00 PM UTC — re-sync odds (line movements)
const ODDS_REFRESH_SCHEDULE = "0 14 * * 5";

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

export function startScheduler() {
  cron.schedule(RESOLVE_SCHEDULE,    runResolveAndAllowances, { timezone: "UTC" });
  cron.schedule(GAME_SYNC_SCHEDULE,  runESPNGameSync,         { timezone: "UTC" });
  cron.schedule(ODDS_SYNC_SCHEDULE,  runOddsSync,             { timezone: "UTC" });
  cron.schedule(ODDS_REFRESH_SCHEDULE, runOddsSync,           { timezone: "UTC" });
  console.log("[scheduler] Cron jobs registered");
}
