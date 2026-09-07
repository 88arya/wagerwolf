import { Queue, Worker, Job } from "bullmq";
import { redisConnection } from "../queue/connection";
import { db } from "../db/db";
import { eq } from "drizzle-orm";
import { weeks, leagues } from "../db/schema";
import { resolveWeekById } from "./resolveWeek";
import { syncESPNGames, syncScores } from "./syncWeek";
import { pollDueGames, discoverWeekEvents } from "./oddsPoller";
import { getNFLWeekDates, nflYear } from "./espnApi";
import { distributeWeeklyAllowances } from "./distributeAllowances";
import { startLeagueSeason } from "./startSeason";
import { settlePendingBetsOnFinalGames } from "./settleGame";
import { MAX_NFL_WEEK } from "./nflSeason";

// Tuesday 11:00 AM UTC — resolve last week, distribute allowances for new week
const RESOLVE_SCHEDULE = "0 11 * * 2";
// Tuesday 6:00 PM UTC — sync ESPN games for upcoming week
const GAME_SYNC_SCHEDULE = "0 18 * * 2";
// Every 30 minutes — tiered odds poll. The tick itself costs nothing; each run
// refreshes only the games whose time-to-kickoff says they are due, so spend is
// concentrated near kickoff instead of spread flat across the week. Replaced a
// Wed+Fri pair, which under per-event billing would have been both too coarse
// near kickoff and wasteful far from it. See services/oddsPoller.ts.
const ODDS_POLL_SCHEDULE = "*/30 * * * *";
// Every minute — sync scores only when a game has kicked off but isn't final yet
const SCORE_SYNC_SCHEDULE = "* * * * *";

const QUEUE_NAME = "cron-jobs";

const JOB = {
  RESOLVE_AND_ALLOWANCES: "resolve-and-allowances",
  ESPN_GAME_SYNC: "espn-game-sync",
  ODDS_POLL: "odds-poll",
  SCORE_SYNC: "score-sync",
} as const;

export const cronQueue = new Queue(QUEUE_NAME, { connection: redisConnection });

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

  // One date-ranged pull to stamp each new game with its SGO eventID. From here
  // the poller addresses games by id, so this is the only broad odds query in
  // the whole week — everything after it spends only on games actually due.
  try {
    const matched = await discoverWeekEvents(week!.id);
    console.log(`[cron] Discovered SGO events for week ${week!.number}: ${matched} games`);
  } catch (err) {
    console.error(`[cron] SGO discovery failed for week ${week!.number}:`, err);
  }

  await runAutoStartLeagues(week!.number);
}

async function runOddsPoll() {
  try {
    await pollDueGames();
  } catch (err) {
    console.error("[cron] Odds poll failed:", err);
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

const HANDLERS: Record<string, () => Promise<void>> = {
  [JOB.RESOLVE_AND_ALLOWANCES]: runResolveAndAllowances,
  [JOB.ESPN_GAME_SYNC]: runESPNGameSync,
  [JOB.ODDS_POLL]: runOddsPoll,
  [JOB.SCORE_SYNC]: runScoreSync,
};

let worker: Worker | null = null;

export async function startScheduler() {
  // upsertJobScheduler is idempotent by schedulerId — safe for every instance
  // to call on boot, Redis just keeps a single active schedule per id. This is
  // what makes the schedule safe across multiple backend instances: only one
  // worker across the whole fleet will ever pick up a given firing.
  await cronQueue.upsertJobScheduler(
    JOB.RESOLVE_AND_ALLOWANCES,
    { pattern: RESOLVE_SCHEDULE, tz: "UTC" },
    { name: JOB.RESOLVE_AND_ALLOWANCES }
  );
  await cronQueue.upsertJobScheduler(
    JOB.ESPN_GAME_SYNC,
    { pattern: GAME_SYNC_SCHEDULE, tz: "UTC" },
    { name: JOB.ESPN_GAME_SYNC }
  );
  await cronQueue.upsertJobScheduler(
    JOB.ODDS_POLL,
    { pattern: ODDS_POLL_SCHEDULE, tz: "UTC" },
    { name: JOB.ODDS_POLL }
  );
  // The retired Wed/Fri jobs would otherwise keep firing from Redis, since
  // schedulers persist by id and nothing removes one just because the code
  // stopped registering it.
  for (const stale of ["odds-sync", "odds-refresh"]) {
    try { await cronQueue.removeJobScheduler(stale); } catch { /* not present */ }
  }
  await cronQueue.upsertJobScheduler(
    JOB.SCORE_SYNC,
    { pattern: SCORE_SYNC_SCHEDULE, tz: "UTC" },
    { name: JOB.SCORE_SYNC }
  );

  worker = new Worker(
    QUEUE_NAME,
    async (job: Job) => {
      const handler = HANDLERS[job.name];
      if (!handler) {
        console.warn(`[cron] No handler registered for job "${job.name}"`);
        return;
      }
      await handler();
    },
    { connection: redisConnection, concurrency: 1 }
  );

  worker.on("failed", (job, err) => {
    console.error(`[cron] Job "${job?.name}" failed:`, err);
  });

  console.log("[scheduler] BullMQ job schedulers registered, worker started");
}

export async function stopScheduler() {
  await worker?.close();
  await cronQueue.close();
}
