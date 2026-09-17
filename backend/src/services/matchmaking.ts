import { eq, and, gt, max, sql, SQL } from "drizzle-orm";
import { db } from "../db/db";
import { leagues, weeks } from "../db/schema";
import { coerceLevel, DEFAULT_LEVEL, LeagueLevel } from "./leagueLevel";
import { generateLeagueName } from "./leagueName";
import { joinLeague } from "./joinLeague";
import { MAX_NFL_WEEK } from "./nflSeason";

/**
 * Assignment, not browsing.
 *
 * Players do not see a list of open leagues. They say what they want — how many
 * teams, beginner or pro — and get seated. That is how ESPN, Yahoo, Sleeper and
 * NFL Fantasy all work, and the reason is that a season-long league with the
 * same ten people is not a product you comparison-shop. Leagues differ by name,
 * size and stake, and none of that decides whether you enjoy it; **whether the
 * league fills and starts** does.
 *
 * Which is also the ranking, and the most important line in this file:
 * candidates are ordered by **fill ratio**, so everyone lands in the league
 * closest to starting. Concentrating joins is what makes leagues fill instead of
 * stranding a hundred half-empty lobbies. A ratio rather than seats-remaining,
 * or a 4-team league with 3 members would outrank a 12-team league with 11.
 *
 * This replaced a ranked, cursor-paginated directory with search, skill bands
 * and location scopes. All of that was infrastructure for a screen users no
 * longer see.
 */

/** How many candidates to fight over before concluding there is nothing. */
const ATTEMPTS = 8;

/**
 * What "joinable" means. One definition, used by both the candidate query and
 * nothing else — there is no second surface that can disagree with it any more.
 *
 * There is deliberately no `activeMemberCount < maxPlayers` race here: this only
 * shortlists. The seat is taken by `claimSeat`, which re-asserts capacity
 * atomically. A league filling between the shortlist and the insert is expected,
 * and the loop below simply moves to the next candidate.
 */
function openLeaguePredicate(userId: string): SQL {
  return sql`
    l."seasonStarted" = false
    AND (l."autoStartAt" IS NULL OR l."autoStartAt" > now())
    AND l."activeMemberCount" < l."maxPlayers"
    AND CASE WHEN l."isPublic"
             THEN true
             ELSE l."maxPublicPlayers" > 0
                  AND l."activePublicFillCount" < l."maxPublicPlayers"
        END
    AND NOT EXISTS (
      SELECT 1 FROM "Membership" m
      WHERE m."leagueId" = l.id AND m."userId" = ${userId}
    )
  `;
}

const FILL_RATIO = sql`l."activeMemberCount"::numeric / NULLIF(l."maxPlayers", 0)`;

export type MatchPrefs = {
  /** Exact team count, or null for "don't care". */
  maxPlayers?: number | null;
  level?: string | null;
  /** NFL week the season starts. Null means "the soonest one". */
  startWeek?: number | null;
};

export type MatchResult = {
  membership: any;
  league: any;
  /** True when the size preference could not be honoured. */
  relaxedSize: boolean;
  /** True when nothing was open and a league was created to seat them. */
  created: boolean;
  /** The week the league they landed in actually starts. */
  startWeek: number;
};

// Duplicated from leagues.routes.ts, which is where it already lived. The
// frontend settings page has its own copy too.

/**
 * The weeks a new league can still start in: every week that has NOT KICKED OFF
 * YET, soonest first, capped to a handful.
 *
 * Derived from the Week table rather than a 1..17 range, because a week already
 * behind us is not a start week — a league starting in week 3 when week 8 has
 * been played would have five weeks of games it can never bet on.
 *
 * THE DATE IS THE TEST; `resolved` ONLY NARROWS IT. This filtered on `resolved`
 * alone, which is a job-completion flag standing in for a clock — and on
 * 16 Sept 2026 the job was a week late, so week 1 was still "unresolved" four
 * days after its last game. Anyone quick-joining was being seated in a league
 * whose season had already been played. `startDate > now` is a fact about the
 * NFL and cannot be made wrong by a cron failing; the `resolved` clause stays
 * because a week can be closed out early, but it is no longer load bearing.
 *
 * A week that has STARTED but not finished is excluded too, and deliberately:
 * seating someone on a Saturday into a league whose Thursday game is already
 * final hands them a week they cannot fully play.
 */
export async function selectableStartWeeks(limit = 6, now: Date = new Date()) {
  const rows = await db
    .select({ number: weeks.number, startDate: weeks.startDate })
    .from(weeks)
    .where(and(eq(weeks.resolved, false), gt(weeks.startDate, now)))
    .orderBy(weeks.number)
    .limit(limit);
  return rows.filter(w => w.number <= MAX_NFL_WEEK);
}

/**
 * The soonest week a new league can start in — the default wherever one is not
 * chosen, shared by quick-join, league creation and the public-league
 * autocreator so the three cannot disagree.
 *
 * THE FALLBACK IS NOT WEEK 1. Three call sites defaulted to 1 when they found
 * nothing, which is the worst possible answer: "nothing ahead of us" means the
 * schedule runs out, and week 1 is the furthest week in the past. It reached
 * for the start of the season precisely when the season was most over.
 *
 * Aiming one past the latest week on record is the honest reading of an empty
 * list — the schedule has not been published that far yet, and Tuesday's ESPN
 * sync creates the row. Clamped to MAX_NFL_WEEK so it cannot run off the end.
 */
export async function nextStartWeek(now: Date = new Date()): Promise<number> {
  const [soonest] = await selectableStartWeeks(1, now);
  if (soonest) return soonest.number;

  const [latest] = await db.select({ n: max(weeks.number) }).from(weeks);
  const next = (latest?.n ?? 0) + 1;
  if (next <= MAX_NFL_WEEK) return next;

  // THE SCHEDULE IS EXHAUSTED, AND THERE IS NO HONEST ANSWER.
  //
  // Every week up to MAX_NFL_WEEK exists and every one of them has kicked off:
  // the season is over. The clamp used to be `Math.min(MAX_NFL_WEEK, next)`,
  // which returned week 17 — a week in the PAST, and the one week guaranteed to
  // produce a broken league, since `regularSeasonWeeks` is computed as
  // `max(1, MAX_NFL_WEEK - startWeek - playoffWeeks + 1)` and floors to 1.
  // Quietly handing back a number that cannot work is the same class of mistake
  // as the `?? 1` this function replaced, one week at the other end.
  //
  // There is no next season to point at: rolling over means new Week rows for a
  // new year, and this product has no concept of a season boundary at all — the
  // Week table is a flat 1..17. So the failure is made LOUD and the caller is
  // told plainly, rather than seated in a league that cannot be played.
  //
  // Callers that cannot fail (the public-league autocreator) should be the
  // thing that changes when season rollover is built; until then this is the
  // one place the gap is named.
  throw new Error(
    `No start week available: every week through ${MAX_NFL_WEEK} has already ` +
    `kicked off. The season is over and no new Week rows have been created — ` +
    `league creation cannot pick a playable start week until they are.`
  );
}

/**
 * Clamp a requested start week to something playable.
 *
 * A client can ask for anything; the floor is whatever week is next unresolved,
 * so a stale picker (left open across a Tuesday resolve) cannot seat someone in
 * a season that has already partly happened.
 */
async function resolveStartWeek(requested: number | null | undefined): Promise<number> {
  const options = await selectableStartWeeks(MAX_NFL_WEEK);
  // `nextStartWeek` rather than `options[0] ?? 1` — see its note. An empty
  // options list used to floor everyone to week 1, the one week guaranteed to
  // be unplayable.
  const first = options[0]?.number ?? (await nextStartWeek());
  if (requested == null) return first;
  const wanted = Number(requested);
  if (!Number.isFinite(wanted)) return first;
  if (!options.some(o => o.number === wanted)) return first;
  return wanted;
}

async function candidates(userId: string, level: LeagueLevel, startWeek: number, maxPlayers: number | null) {
  const parts: SQL[] = [
    openLeaguePredicate(userId),
    // Level is never relaxed. Someone who asked for a beginner league and got
    // dropped into a pro one has been given the opposite of what they wanted,
    // which is worse than being told to wait.
    sql`l."skillLevel" = ${level}`,
    // Neither is the start week, and for a stronger reason: it is *when you
    // play*. Quietly seating someone in a league that kicks off six weeks later
    // is the worst surprise this flow could produce, and creating a league with
    // the right week costs nothing. Size is the only thing that gives.
    sql`l."startWeek" = ${startWeek}`,
  ];
  if (maxPlayers) parts.push(sql`l."maxPlayers" = ${maxPlayers}`);

  const where = parts.reduce((acc, p, i) => (i === 0 ? sql`${p}` : sql`${acc} AND ${p}`), sql`true`);

  const rows = await db.execute(sql`
    SELECT l.id, l."isPublic", l."weeklyAllowance", l."startWeek",
           l."regularSeasonWeeks", l."playoffWeeks", l."name", l."maxPlayers"
    FROM "League" l
    WHERE ${where}
    ORDER BY ${FILL_RATIO} DESC, l."createdAt" DESC
    LIMIT ${ATTEMPTS}
  `);
  return rows.rows as any[];
}

/**
 * Seat the user in the best-fitting open league.
 *
 * Size is the only preference that can be given up, and only after the exact
 * size has been tried. If nothing of the requested level is open at any size, a
 * league is **created and the user made its commissioner** rather than the
 * request failing. "No leagues available" is a dead end, and it was the failure
 * mode of the blind join-public this replaced. It also means supply replenishes
 * itself — the person who found nothing becomes the league the next person is
 * assigned to — which is why there is no provisioning job.
 */
export async function matchAndJoin(userId: string, prefs: MatchPrefs): Promise<MatchResult> {
  const level = coerceLevel(prefs.level);
  const startWeek = await resolveStartWeek(prefs.startWeek);
  const wanted = prefs.maxPlayers && prefs.maxPlayers >= 2 ? prefs.maxPlayers : null;

  // Exact size first, then any size. Size is the only preference on the ladder
  // — level and start week are hard filters, and if neither can be satisfied a
  // league is created that satisfies both exactly.
  const rungs: Array<number | null> = wanted ? [wanted, null] : [null];

  for (const size of rungs) {
    for (const c of await candidates(userId, level, startWeek, size)) {
      const outcome = await joinLeague(userId, {
        id: c.id,
        weeklyAllowance: c.weeklyAllowance,
        startWeek: c.startWeek,
        regularSeasonWeeks: c.regularSeasonWeeks,
        playoffWeeks: c.playoffWeeks,
      }, { isPublicFill: !c.isPublic });

      if (outcome.ok) {
        const [league] = await db.select().from(leagues).where(eq(leagues.id, c.id)).limit(1);
        return {
          membership: outcome.membership,
          league,
          // Measured against the league actually joined, not which rung we
          // reached — the exact-size rung can fail for reasons unrelated to
          // size, and claiming "we widened your size" about a league that is
          // the size you asked for would simply be false.
          relaxedSize: !!wanted && c.maxPlayers !== wanted,
          created: false,
          startWeek: league.startWeek,
        };
      }
    }
  }

  return createLeagueFor(userId, level, wanted, startWeek);
}

/** Last resort: a league shaped like the request, with the user as commissioner. */
async function createLeagueFor(
  userId: string,
  level: LeagueLevel,
  wanted: number | null,
  startWeek: number
): Promise<MatchResult> {
  // Round-robin scheduling needs an even roster.
  const maxPlayers = wanted && wanted >= 2 && wanted <= 20 && wanted % 2 === 0 ? wanted : 10;

  const playoffSize = Math.pow(2, Math.floor(Math.log2(maxPlayers - 1)));
  const playoffWeeks = Math.ceil(Math.log2(playoffSize));

  const regularSeasonWeeks = Math.max(1, MAX_NFL_WEEK - startWeek - playoffWeeks + 1);

  let inviteCode = Math.random().toString(36).substring(2, 8).toUpperCase();
  while (await db.query.leagues.findFirst({ where: eq(leagues.inviteCode, inviteCode) })) {
    inviteCode = Math.random().toString(36).substring(2, 8).toUpperCase();
  }

  const [league] = await db.insert(leagues).values({
    name: generateLeagueName(),
    weeklyAllowance: 30000,
    inviteCode,
    creatorId: userId,
    isPublic: true,
    maxPlayers,
    startWeek,
    regularSeasonWeeks,
    playoffWeeks,
    playoffSize,
    consolationTeams: maxPlayers - playoffSize,
    consolationWeeks: 2,
    skillLevel: level,
  }).returning();

  const outcome = await joinLeague(userId, league);
  if (!outcome.ok) throw new Error(`Created a league but could not join it: ${outcome.reason}`);

  return { membership: outcome.membership, league, relaxedSize: false, created: true, startWeek: league.startWeek };
}

export { DEFAULT_LEVEL };
