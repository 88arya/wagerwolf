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
 *
 * THAT IS STILL THE DEADLINE, and there is now also a shortcut: the ROLLOVER.
 * See resolvePastWeeks. A week whose games are all FINAL is resolved early,
 * once the next week's slate is in, which moves the whole handover (results,
 * the new board, the allowance) to shortly after Monday night instead of
 * Tuesday afternoon. Status only ever brings a resolve forward; the deadline
 * path above is untouched, so a game the score sync missed still gets repaired
 * by `finalizeScores` at `endDate`, exactly as before.
 *
 * Every 15 minutes rather than hourly so the rollover lands within a quarter
 * hour of the final whistle. A tick with nothing to do is still two queries.
 */
const RESOLVE_SCHEDULE = "*/15 * * * *";
// Tuesday 6:00 PM UTC — sync ESPN games for upcoming week. A BACKSTOP now: the
// rollover prepares the next week itself, so on a normal week this finds the
// slate already there and only re-checks it (schedule changes, auto-start).
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
export async function runResolveAndAllowances(fail: Fail = reportOnly) {
  // Each pass is isolated. They run in order because pass B depends on pass A's
  // effect, but a throw in one must not cancel the two after it — the whole
  // point of the split is that a failure in the money half cannot take the
  // resolve half down with it, or vice versa.
  for (const pass of [resolvePastWeeks, catchUpAllowances, warnOnStuckWeeks]) {
    try {
      await pass(fail);
    } catch (err) {
      fail(pass.name, err);
    }
  }
}

/**
 * Pass A — close out every week whose games are behind us.
 *
 * TWO WAYS IN. Past `endDate` is the deadline, and resolves unconditionally, as
 * it always has. Before it, a week whose every game is FINAL takes the ROLLOVER:
 *
 *   0. wait until every bet on the week has settled, props included
 *   1. prepare the next week: its slate from ESPN, its odds discovered
 *   2. resolve this one
 *   3. pass B, in this same run, pays the next week's allowance
 *
 * so results, the new board and the fresh balance arrive together rather than
 * as a rollout across an afternoon. Nothing marks the switch for the UI: every
 * "current week" read skips resolved weeks (services/currentWeek), so step 2 is
 * the switch, and step 1 is what stops that switch landing on an empty week.
 *
 * If the next week cannot be prepared, the rollover waits and retries on the
 * next tick, and the deadline still resolves the week regardless. Waiting is
 * the cohesive choice: resolving without a next week would hand users results
 * and a balance with nothing to bet on.
 *
 * The last regular week has no next week to wait for.
 */
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
      // The football is over; the grading may not be. Props wait on SGO to
      // finalize (services/gradeRetry.ts), and closing the week before they
      // settle would leave their bets pending for good.
      if (await weekHasPendingBets(week.id)) continue;
      if (week.number < MAX_NFL_WEEK) {
        // Prepare only if the next slate is not already in. A resolve that
        // keeps failing retries every tick until the deadline, and repeating
        // the preparation each time would re-bill discovery for any game the
        // feed never lists. Tuesday's backstop still re-checks a ready week.
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
async function catchUpAllowances(fail: Fail) {
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

/**
 * The season stalling is silent, and that is how it got a week's head start.
 *
 * Every hour a week stays unresolved well past its own end, this reports it:
 * to Sentry when configured, grouped per week so it alerts once and not every
 * hour, and to stderr regardless. Before, the state was only visible through its
 * downstream symptoms, which last time meant noticing that the landing page was
 * advertising the wrong slate.
 *
 * It reports a condition and does not fail the job. Nothing threw, and a failed
 * heartbeat should mean the scheduler itself is in trouble.
 */
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
    const activeMembers = (league.memberships as any[]).filter((m: any) => m.status === "ACTIVE");
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

/**
 * Get a week ready to bet into: the Week row and its dates, its games from
 * ESPN, their SGO eventIDs, and any league due to start in it. Returns whether
 * the week has games, which is what the rollover waits on.
 *
 * Shared by the rollover (which calls it for the week about to open) and the
 * Tuesday backstop, and safe to run repeatedly: the week is upserted, games
 * upsert on espnId, and auto-start only touches leagues not yet started.
 *
 * DISCOVERY ONLY RUNS FOR GAMES THAT STILL NEED IT. It is the one broad odds
 * query of the week and it bills every event it returns, so re-running it for a
 * slate already matched would double the week's discovery spend for nothing:
 * from the first match on, the poller addresses each game by id. It does run
 * again if any game is still unmatched, which is also the retry for a game the
 * feed had not listed yet on the first attempt.
 */
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

    // THE LANDING PAGE'S BOARD IS DROPPED HERE, so it is rebuilt from the slate
    // discovery just priced.
    //
    // The window it closes: the week can become current before its odds land,
    // and the board is snapshotted on first request and held for the week
    // (services/publicMarkets), so a single visitor in that window would freeze
    // an empty marquee until the following Tuesday. Clearing it after discovery
    // means the next request rebuilds against a full board. Only when discovery
    // ran: with nothing newly matched there is nothing new to rebuild from.
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
    (g: any) => new Date(g.gameDate) <= now && g.status !== "FINAL" && g.status !== "CANCELLED"
  );

  try {
    if (hasActiveGame) await syncScores(week.id);
    // Settle bets on any game that has gone FINAL so winnings are re-bettable
    // on later games in the same week (runs even after the last game finishes,
    // so a settle missed during a restart still lands before Tuesday's resolve)
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
    (job: Job) => runJob(job.name, HANDLERS),
    {
      connection: redisConnection,
      concurrency: 1,
      // BULLMQ KEEPS EVERY FINISHED JOB BY DEFAULT, and the score sync alone
      // finishes 1,440 a day. Nothing set these before, so Redis has been
      // keeping every run since launch, inside a 192M cap and persisted to an
      // append-only file. Failed jobs are kept longer because they are the ones
      // worth reading.
      removeOnComplete: { count: 200 },
      removeOnFail: { count: 1000 },
    }
  );

  worker.on("failed", (job, err) => {
    // StepsFailed has already been reported step by step. Anything else is the
    // worker itself failing the job (a stall, a lost lock), which nothing has
    // reported yet.
    if (err instanceof StepsFailed) console.error(`[cron] ${err.message}`);
    else reportError(`[cron] Job "${job?.name}" failed:`, err, { job: job?.name });
  });

  console.log("[scheduler] BullMQ job schedulers registered, worker started");
}

export async function stopScheduler() {
  await worker?.close();
  await cronQueue.close();
}
