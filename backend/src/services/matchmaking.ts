import { eq, and, gt, max, sql, SQL } from "drizzle-orm";
import { db } from "../db/db";
import { leagues, weeks } from "../db/schema";
import { coerceLevel, DEFAULT_LEVEL, LeagueLevel } from "./leagueLevel";
import { generateLeagueName } from "./leagueName";
import { joinLeague } from "./joinLeague";
import { MAX_NFL_WEEK } from "./nflSeason";

/** How many candidates to fight over before concluding there is nothing. */
const ATTEMPTS = 8;

// Shortlist only; claimSeat re-checks capacity atomically.
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

// Weeks that haven't kicked off yet. Filters on dates, not just `resolved`.
export async function selectableStartWeeks(limit = 6, now: Date = new Date()) {
  const rows = await db
    .select({ number: weeks.number, startDate: weeks.startDate })
    .from(weeks)
    .where(and(eq(weeks.resolved, false), gt(weeks.startDate, now)))
    .orderBy(weeks.number)
    .limit(limit);
  return rows.filter(w => w.number <= MAX_NFL_WEEK);
}

// Falls back to one past the latest week on record, not week 1.
export async function nextStartWeek(now: Date = new Date()): Promise<number> {
  const [soonest] = await selectableStartWeeks(1, now);
  if (soonest) return soonest.number;

  const [latest] = await db.select({ n: max(weeks.number) }).from(weeks);
  const next = (latest?.n ?? 0) + 1;
  if (next <= MAX_NFL_WEEK) return next;

  throw new Error(
    // Every week has kicked off: the season is over and there's no valid answer.
    `No start week available: every week through ${MAX_NFL_WEEK} has already ` +
    `kicked off. The season is over and no new Week rows have been created — ` +
    `league creation cannot pick a playable start week until they are.`
  );
}

// Clamp to the next playable week in case the client's options are stale.
async function resolveStartWeek(requested: number | null | undefined): Promise<number> {
  const options = await selectableStartWeeks(MAX_NFL_WEEK);
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
    // Level and start week are never relaxed; only size is.
    sql`l."skillLevel" = ${level}`,
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

// Candidates are ranked by fill ratio so joins concentrate and leagues actually
// start. Tries exact size, then any size; if nothing fits, creates a league with
// the user as commissioner.
export async function matchAndJoin(userId: string, prefs: MatchPrefs): Promise<MatchResult> {
  const level = coerceLevel(prefs.level);
  const startWeek = await resolveStartWeek(prefs.startWeek);
  const wanted = prefs.maxPlayers && prefs.maxPlayers >= 2 ? prefs.maxPlayers : null;

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
          // Compare against the league joined, not which rung matched.
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
