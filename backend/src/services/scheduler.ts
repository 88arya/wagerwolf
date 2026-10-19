import { Queue, Worker, Job } from "bullmq";
import { redisConnection } from "../queue/connection";
import { db } from "../db/db";
import { eq, and, lt, lte, asc } from "drizzle-orm";
import { weeks, games } from "../db/schema";
import { allGamesFinal } from "./weekState";
import { resolveWeekById } from "./resolveWeek";
import { syncESPNGames, syncScores } from "./syncWeek";
import { pollDueGames, discoverWeekEvents } from "./oddsPoller";
import { getNFLWeekDates, nflYear } from "./espnApi";
import { distributeWeeklyAllowances } from "./distributeAllowances";
import { startLeagueSeason } from "./startSeason";
import { settlePendingBetsOnFinalGames, weekHasPendingBets } from "./settleGame";
import { MAX_NFL_WEEK } from "./nflSeason";
import { reportError, reportCondition } from "../lib/monitoring";
// Every catch below reports through a `fail` callback; see jobRunner.ts for why.
import { runJob, reportOnly, StepsFailed, type Fail, type Handler } from "./jobRunner";

// Resolves any week past its endDate (last kickoff + 18h), and rolls a week
// over early once all its games are FINAL. 15 min so the rollover lands soon
// after Monday night. An idle tick is two queries.
const RESOLVE_SCHEDULE = "*/15 * * * *";
// Tuesday backstop; the rollover normally prepares the next week already.
const GAME_SYNC_SCHEDULE = "0 18 * * 2";
// Cheap tick: only games due on their time-to-kickoff tier are refreshed.
const ODDS_POLL_SCHEDULE = "*/30 * * * *";
// Every minute - sync scores only when a game has kicked off but isn't final yet
const SCORE_SYNC_SCHEDULE = "* * * * *";

const QUEUE_NAME = "cron-jobs";

const JOB = {
  RESOLVE_AND_ALLOWANCES: "resolve-and-allowances",
  ESPN_GAME_SYNC: "espn-game-sync",
  ODDS_POLL: "odds-poll",
  SCORE_SYNC: "score-sync",
} as const;

export const cronQueue = new Queue(QUEUE_NAME, { connection: redisConnection });

// Resolve and allowances are separate passes so a failure in one still lets the
// other retry next tick. Allowances wait for the previous week to resolve,
// because matchups are decided on ending balance and paying overwrites it.
export async function runResolveAndAllowances(fail: Fail = reportOnly) {
  // A throw in one pass must not skip the others.
  for (const pass of [resolvePastWeeks, catchUpAllowances, warnOnStuckWeeks]) {
    try {
      await pass(fail);
    } catch (err) {
      fail(pass.name, err);
    }
  }
}

// Past endDate: resolve unconditionally. Earlier, if every game is FINAL and
// all bets have settled: prepare next week, then resolve this one, so results,
// the new board and the new balance land together.
async function resolvePastWeeks(fail: Fail) {
  const now = new Date();
  const started = await db.query.weeks.findMany({
    where: and(eq(weeks.resolved, false), lte(weeks.startDate, now)),
    orderBy: asc(weeks.number),
    with: { games: { columns: { status: true } } },
  });

  for (const week of started) {
    const pastDeadline = week.endDate < now;
    if (!pastDeadline) {
      if (!allGamesFinal(week.games)) continue;
      // Props wait on SGO to finalize; resolving now would strand their bets.
      if (await weekHasPendingBets(week.id)) continue;
      if (week.number < MAX_NFL_WEEK) {
        // Skip preparing if the next slate is already in, to avoid re-billing discovery.
        const next = await db.query.weeks.findFirst({
          where: eq(weeks.number, week.number + 1),
          with: { games: { columns: { id: true } } },
        });
        let ready = (next?.games.length ?? 0) > 0;
        if (!ready) {
          try {
            ready = await prepareWeek(week.number + 1, fail);
          } catch (err) {
            fail(`rollover: prepare week ${week.number + 1}`, err);
          }
        }
        if (!ready) continue;
      }
      console.log(`[cron] Rollover: week ${week.number} is final, resolving ahead of its deadline`);
    }

    try {
      await resolveWeekById(week.id, { early: !pastDeadline });
    } catch (err) {
      fail(`resolve week ${week.number}`, err);
    }
  }
}

// Pays any unpaid week once its predecessor is resolved.
async function catchUpAllowances(fail: Fail) {
  const now = new Date();
  const undistributed = await db.query.weeks.findMany({
    where: eq(weeks.allowanceDistributed, false),
    orderBy: asc(weeks.number),
  });

  for (const week of undistributed) {
    // Never pay after kickoff: resetting balance mid-week would refund live stakes.
    if (week.startDate <= now) {
      // Only warn while someone can still act on it.
      if (week.endDate > now) {
        reportCondition(
          `[cron] MISSED: week ${week.number} kicked off without its allowance being ` +
          `distributed. Not paying it now — that would reset balances over live bets. ` +
          `Needs a manual decision.`,
          ["cron-missed-allowance", String(week.number)],
          { week: week.number }
        );
      }
      continue;
    }

    if (week.number > 1) {
      const prev = await db.query.weeks.findFirst({
        where: eq(weeks.number, week.number - 1),
      });
      if (prev && !prev.resolved) continue;
    }

    try {
      await distributeWeeklyAllowances(week.number);
    } catch (err) {
      fail(`distribute allowances week ${week.number}`, err);
    }
  }
}

// Alerts (once per week) when a week stays unresolved well past its end.
async function warnOnStuckWeeks(_fail: Fail) {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const stuck = await db.query.weeks.findMany({
    where: and(eq(weeks.resolved, false), lt(weeks.endDate, cutoff)),
    orderBy: asc(weeks.number),
  });

  for (const week of stuck) {
    const hours = Math.round((Date.now() - week.endDate.getTime()) / 3_600_000);
    reportCondition(
      `[cron] STUCK: week ${week.number} is still unresolved ${hours}h after its endDate — ` +
      `matchups, standings and the next week's allowances are all blocked behind it.`,
      ["cron-stuck-week", String(week.number)],
      { week: week.number }
    );
  }
}

async function runAutoStartLeagues(weekNumber: number, fail: Fail) {
  const leagueList = await db.query.leagues.findMany({
    where: (l, { and, eq }) => and(eq(l.startWeek, weekNumber), eq(l.seasonStarted, false)),
    with: { memberships: true },
  });

  for (const league of leagueList) {
    const activeMembers = (league.memberships as any[]).filter((m) => m.status === "ACTIVE");
    if (activeMembers.length < 2) {
      console.log(`[cron] Skipping auto-start for league ${league.id} — fewer than 2 members`);
      continue;
    }
    try {
      await startLeagueSeason(league.id);
      console.log(`[cron] Auto-started league ${league.id} for week ${weekNumber}`);
    } catch (err) {
      fail(`auto-start league ${league.id}`, err);
    }
  }
}

async function runESPNGameSync(fail: Fail) {
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

  await prepareWeek(weekNumber, fail);
}

// Week row, ESPN games, SGO event ids and auto-start. Safe to repeat; discovery
// only runs for games still unmatched. Returns whether the week has games.
async function prepareWeek(weekNumber: number, fail: Fail): Promise<boolean> {
  if (weekNumber > MAX_NFL_WEEK) {
    console.log("[cron] Season complete, no weeks to sync");
    return false;
  }

  // Fetch week date range from ESPN and upsert the Week row
  const year = nflYear(new Date());
  const weekDates = await getNFLWeekDates(weekNumber, year);
  if (!weekDates) {
    console.log(`[cron] ESPN returned no games for week ${weekNumber} ${year}`);
    return false;
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
    fail(`ESPN game sync week ${week!.number}`, err);
  }

  const slate = await db.select({ externalId: games.externalId })
    .from(games).where(eq(games.weekId, week!.id));
  const unmatched = slate.filter((g) => !g.externalId).length;

  if (unmatched > 0) {
    try {
      const matched = await discoverWeekEvents(week!.id);
      console.log(`[cron] Discovered SGO events for week ${week!.number}: ${matched} games`);
    } catch (err) {
      fail(`SGO discovery week ${week!.number}`, err);
    }

    // Drop the cached landing board so it rebuilds with the new odds.
    await db.update(weeks).set({ publicBoard: null }).where(eq(weeks.id, week!.id));
  }

  await runAutoStartLeagues(week!.number, fail);
  return slate.length > 0;
}

async function runOddsPoll() {
  await pollDueGames();
}

async function runScoreSync(fail: Fail) {
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
    (g) => new Date(g.gameDate) <= now && g.status !== "FINAL" && g.status !== "CANCELLED"
  );

  try {
    if (hasActiveGame) await syncScores(week.id);
    // Settle finished games mid-week so winnings can be re-bet.
    await settlePendingBetsOnFinalGames(week.id);
  } catch (err) {
    fail(`score sync week ${week.number}`, err);
  }
}

const HANDLERS: Record<string, Handler> = {
  [JOB.RESOLVE_AND_ALLOWANCES]: runResolveAndAllowances,
  [JOB.ESPN_GAME_SYNC]: runESPNGameSync,
  [JOB.ODDS_POLL]: runOddsPoll,
  [JOB.SCORE_SYNC]: runScoreSync,
};

let worker: Worker | null = null;

// upsertJobScheduler is idempotent per id, so every instance can register on
// boot and Redis still holds one schedule; only one worker takes each firing.
export async function startScheduler() {
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
  // Schedulers persist in Redis, so retired ones have to be removed explicitly.
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
    (job: Job) => runJob(job.name, HANDLERS),
    {
      connection: redisConnection,
      concurrency: 1,
      // BullMQ keeps every finished job by default.
      removeOnComplete: { count: 200 },
      removeOnFail: { count: 1000 },
    }
  );

  worker.on("failed", (job, err) => {
    // StepsFailed was already reported per step.
    if (err instanceof StepsFailed) console.error(`[cron] ${err.message}`);
    else reportError(`[cron] Job "${job?.name}" failed:`, err, { job: job?.name });
  });

  console.log("[scheduler] BullMQ job schedulers registered, worker started");
}

export async function stopScheduler() {
  await worker?.close();
  await cronQueue.close();
}
