import { Queue, Worker, Job } from "bullmq";
import { redisConnection } from "../queue/connection";
import { db } from "../db/db";
import { eq, and, lt, asc } from "drizzle-orm";
import { weeks, leagues } from "../db/schema";
import { resolveWeekById } from "./resolveWeek";
import { syncESPNGames, syncScores } from "./syncWeek";
import { pollDueGames, discoverWeekEvents } from "./oddsPoller";
import { getNFLWeekDates, nflYear } from "./espnApi";
import { distributeWeeklyAllowances } from "./distributeAllowances";
import { startLeagueSeason } from "./startSeason";
import { settlePendingBetsOnFinalGames } from "./settleGame";
import { MAX_NFL_WEEK } from "./nflSeason";

/**
 * HOURLY, not Tuesday 11:00 UTC — and the change is a bug fix, not a tuning.
 *
 * The old pattern was "0 11 * * 2". The predicate it feeds is `endDate < now`,
 * and `Week.endDate` is the last kickoff plus 18 hours (espnApi.ts). Monday
 * Night Football kicks at 00:15 UTC Tuesday, so `endDate` lands at 18:15 UTC
 * Tuesday — SEVEN HOURS AFTER the cron that was supposed to consume it. The
 * predicate could never be true on the day it fired, so every week was picked
 * up by the FOLLOWING Tuesday's run: every resolve, every matchup result and
 * every allowance ran a full week late, all season, by construction.
 *
 * Hourly fixes it twice over. The week becomes eligible at 18:15 and is
 * resolved at 19:00 the same day; and because the job now gets 168 attempts a
 * week instead of 1, a run that fails for any other reason retries in an hour
 * rather than in seven days. That second property is the one that matters most
 * — the original bug went unnoticed for a week precisely because there was no
 * second attempt to fail more loudly.
 *
 * The tick itself is nearly free: two queries when there is nothing to do.
 *
 * WHAT WAS DELIBERATELY NOT DONE: gating on "every game is FINAL" instead of on
 * `endDate`. It sounds more correct and is worse here — `Game.status` is only
 * accurate if the score sync flipped it, and `finalizeScores` inside
 * resolveWeekById is the very thing that repairs a game the sync missed. Gating
 * resolve on all-final means the one game needing repair is the one blocking
 * the repair. The dates are the reliable signal; leave it on them.
 */
const RESOLVE_SCHEDULE = "0 * * * *";
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

/**
 * TWO INDEPENDENT PASSES, and the separation is the fix for a silent loss.
 *
 * They used to be one loop: for each past unresolved week, resolve it and then
 * distribute the next week's allowance. The distribution was nested inside the
 * iteration over UNRESOLVED weeks — so if it threw, the catch logged it, the
 * week was already marked resolved, and it dropped out of the query on the next
 * run. Nothing ever retried. One transient error cost a league a whole week's
 * balance, permanently and without a word.
 *
 * Split, pass B re-examines every undistributed week on every tick, so it
 * retries by construction until it succeeds. Retrying is only safe because
 * distributeWeeklyAllowances is now one transaction — see that file.
 *
 * THE ORDERING INVARIANT SURVIVES THE SPLIT, and it is not optional:
 * resolveWeekById decides matchups on each member's ENDING BALANCE, and paying
 * the next week's allowance overwrites exactly that number. So pass B refuses
 * to pay week N until week N-1 is resolved. That gate — rather than the old
 * nesting — is what keeps "resolve before reset" true.
 */
/*
 * EXPORTED so it can be triggered by hand. Two reasons, both operational:
 * an allowance the hourly pass refused to pay (a week that kicked off unpaid —
 * see catchUpAllowances) needs a human to run the recovery deliberately, and
 * the whole job is the thing worth rehearsing against a restored snapshot
 * before a deploy that will run it for real.
 */
export async function runResolveAndAllowances() {
  // Each pass is isolated. They run in order because pass B depends on pass A's
  // effect, but a throw in one must not cancel the two after it — the whole
  // point of the split is that a failure in the money half cannot take the
  // resolve half down with it, or vice versa.
  for (const pass of [resolvePastWeeks, catchUpAllowances, warnOnStuckWeeks]) {
    try {
      await pass();
    } catch (err) {
      console.error(`[cron] ${pass.name} failed:`, err);
    }
  }
}

/** Pass A — close out every week whose games are behind us. */
async function resolvePastWeeks() {
  const now = new Date();
  const pastUnresolved = await db.query.weeks.findMany({
    where: and(eq(weeks.resolved, false), lt(weeks.endDate, now)),
    orderBy: asc(weeks.number),
  });

  for (const week of pastUnresolved) {
    try {
      await resolveWeekById(week.id);
    } catch (err) {
      console.error(`[cron] Failed to resolve week ${week.number}:`, err);
    }
  }
}

/**
 * Pass B — pay any week that has not been paid, once its predecessor is closed.
 *
 * TWO GUARDS, both load bearing:
 *
 *   - THE WEEK MUST NOT BE OVER. Paying a finished week now would reset every
 *     live balance to an allowance for football that has already been played,
 *     wiping whatever the current week's betting has done. A week that ended
 *     unpaid has been missed for good; the honest move is to leave it and say
 *     so, not to pay it retroactively into the present.
 *   - ITS PREDECESSOR MUST BE RESOLVED. The ordering invariant above. It also
 *     stops the pass running ahead of itself: week N+1 is gated behind week N
 *     being resolved, so a schedule loaded weeks in advance pays out one week
 *     at a time rather than all at once.
 *
 * A week with no predecessor row at all (a league whose season starts mid-year,
 * where earlier weeks were never created) passes the gate — there is nothing to
 * wait for, and startLeagueSeason has already paid that league its own share.
 */
async function catchUpAllowances() {
  const now = new Date();
  const undistributed = await db.query.weeks.findMany({
    where: eq(weeks.allowanceDistributed, false),
    orderBy: asc(weeks.number),
  });

  for (const week of undistributed) {
    // THE WEEK MUST NOT HAVE KICKED OFF. Distribution OVERWRITES balance, and a
    // stake is deducted the moment a bet is placed — so resetting mid-week
    // refunds every bet already struck while leaving the bets themselves live.
    // That is a straight money leak, and it is one the broken schedule was
    // already causing: resolving week N a week late distributed week N+1's
    // allowance in the middle of week N+1, on top of live bets.
    //
    // So an allowance not paid before kickoff is NOT paid retroactively. It is
    // logged loudly instead, because silently skipping a week's money is how
    // this class of bug stays invisible — and a human topping it up knowingly
    // is better than the scheduler doing it over open positions.
    if (week.startDate <= now) {
      // WARNED ONLY WHILE SOMEONE COULD STILL ACT. This runs every hour, so an
      // unconditional log here would repeat for a permanently-missed week until
      // the end of time — and the noise would bury the weeks that still matter.
      // Once the week is over there is no decision left to make, and the row
      // itself (`allowanceDistributed = false`, forever) is the permanent
      // record. The log is for the window where a human can still fix it.
      if (week.endDate > now) {
        console.error(
          `[cron] MISSED: week ${week.number} kicked off without its allowance being ` +
          `distributed. Not paying it now — that would reset balances over live bets. ` +
          `Needs a manual decision.`
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
      console.error(`[cron] Failed to distribute allowances for week ${week.number}:`, err);
    }
  }
}

/**
 * The season stalling is silent, and that is how it got a week's head start.
 *
 * There is no error tracking on this box (see DEPLOYMENT.md) — one instance,
 * `docker compose logs`, and nothing watching them. This does not change that.
 * What it does is leave a greppable line every hour a week stays unresolved
 * well past its own end, so the state is discoverable at all rather than only
 * visible through its downstream symptoms — which last time meant noticing that
 * the landing page was advertising the wrong slate.
 *
 * It is a stopgap for real alerting, not a substitute for it. A log nobody
 * tails is not monitoring.
 */
async function warnOnStuckWeeks() {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const stuck = await db.query.weeks.findMany({
    where: and(eq(weeks.resolved, false), lt(weeks.endDate, cutoff)),
    orderBy: asc(weeks.number),
  });

  for (const week of stuck) {
    const hours = Math.round((Date.now() - week.endDate.getTime()) / 3_600_000);
    console.error(
      `[cron] STUCK: week ${week.number} is still unresolved ${hours}h after its endDate — ` +
      `matchups, standings and the next week's allowances are all blocked behind it.`
    );
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

  // THE LANDING PAGE'S BOARD IS DROPPED HERE, so it is rebuilt from the slate
  // this job just fetched.
  //
  // The window it closes: a resolve can make next week current before this job
  // has fetched its slate — so for a stretch the "current" week has no games
  // and no odds. The board is snapshotted on first request and
  // held for the week (services/publicMarkets), so a single visitor in that
  // window would freeze an empty marquee until the following Tuesday. Clearing
  // it after discovery means the next request rebuilds against a full board.
  await db.update(weeks).set({ publicBoard: null }).where(eq(weeks.id, week!.id));

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
