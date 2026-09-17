import { and, eq, inArray, isNotNull, or, sql } from "drizzle-orm";
import { db } from "../db/db";
import { memberships, matchups, leagues, games } from "../db/schema";
import { tallyRecords, compareStandings } from "./standings";
import { currentWeek } from "./currentWeek";

/**
 * One row per league the signed-in user plays in, for the Power rankings card
 * on /home.
 *
 * Two facts per league, one for each of the card's tabs:
 *
 * - **Last week** — where they rank now and where they ranked before the most
 *   recent resolved week, so the card can show the move.
 * - **This week** — what is left of their allowance and how many wagers they
 *   have standing, so the card can say which leagues still want betting.
 *
 * RANKS COME FROM services/standings.ts, NOT FROM A SECOND SORT HERE.
 * `tallyRecords` + `compareStandings` are the single source of truth for every
 * ranking in the app — leaderboard, member profile, playoff seeding — and that
 * file's header says so. A private comparator here would rank the same league
 * differently on /home than on its own leaderboard, which is the kind of
 * disagreement nobody reports as a bug because each screen looks right alone.
 *
 * The previous-week rank is computed the same way the leaderboard computes its
 * `prevRank`: tally again with the latest resolved week's matchups removed.
 * That is what "rank change" means here — the move the last resolve caused, not
 * a stored history. Nothing records standings over time, so this is derived on
 * read, and it is the only definition available without a new table.
 *
 * LOBBY LEAGUES ARE EXCLUDED. A league that has not started has no matchups and
 * no allowance, so both tabs would be reporting on nothing: everyone ties at
 * rank 1 and nobody can bet. It is left out rather than shown as a flat row.
 */

export type LeagueRow = {
  leagueId: string;
  leagueName: string;
  members: number;
  rank: number;
  prevRank: number;
  /** Positive = moved up the table (rank number fell). Zero = unchanged. */
  change: number;
  /** False when no week has resolved yet, so `change` is 0 for want of history. */
  ranked: boolean;
  balance: number;
  /** Wagers this user has standing on the current week, across all bet types. */
  betsThisWeek: number;
};

export async function homeLeaguesFor(userId: string): Promise<LeagueRow[]> {
  const mine = await db
    .select({ leagueId: memberships.leagueId })
    .from(memberships)
    .where(and(eq(memberships.userId, userId), eq(memberships.status, "ACTIVE")));

  const leagueIds = mine.map((m) => m.leagueId);
  if (leagueIds.length === 0) return [];

  // Every ACTIVE membership in those leagues, and every settled matchup — the
  // two inputs tallyRecords wants. Fetched across all of the user's leagues at
  // once rather than per league, so this stays three queries whether they play
  // in one league or ten.
  const [leagueRows, memberRows, matchupRows] = await Promise.all([
    db.select({ id: leagues.id, name: leagues.name, seasonStarted: leagues.seasonStarted })
      .from(leagues)
      .where(inArray(leagues.id, leagueIds)),
    db.select({
      leagueId: memberships.leagueId,
      userId: memberships.userId,
      balance: memberships.balance,
    })
      .from(memberships)
      .where(and(inArray(memberships.leagueId, leagueIds), eq(memberships.status, "ACTIVE"))),
    db.select().from(matchups).where(
      and(
        inArray(matchups.leagueId, leagueIds),
        or(isNotNull(matchups.winnerId), eq(matchups.isTie, true)),
      )
    ),
  ]);

  const betCounts = await standingBetsThisWeek(userId, leagueIds);

  const membersBy = new Map<string, Array<{ userId: string; balance: number }>>();
  for (const m of memberRows) {
    const list = membersBy.get(m.leagueId) ?? [];
    list.push({ userId: m.userId, balance: m.balance });
    membersBy.set(m.leagueId, list);
  }

  const matchupsBy = new Map<string, any[]>();
  for (const mu of matchupRows) {
    const list = matchupsBy.get(mu.leagueId) ?? [];
    list.push(mu);
    matchupsBy.set(mu.leagueId, list);
  }

  const out: LeagueRow[] = [];

  for (const league of leagueRows) {
    if (!league.seasonStarted) continue;

    const members = membersBy.get(league.id) ?? [];
    const played = matchupsBy.get(league.id) ?? [];
    if (members.length === 0) continue;

    const rankOf = (subset: any[]) => {
      const records = tallyRecords(members, subset);
      const order: Record<string, number> = {};
      members
        .map((m) => ({ userId: m.userId, ...records[m.userId] }))
        .sort(compareStandings)
        .forEach((entry, i) => { order[entry.userId] = i + 1; });
      return order;
    };

    const rank = rankOf(played)[userId];
    if (rank == null) continue;

    // Roll the standings back one week by dropping the latest resolved week's
    // matchups — the same derivation the league leaderboard uses for prevRank.
    const weekNumbers = played.map((m) => m.weekNumber);
    const latest = weekNumbers.length ? Math.max(...weekNumbers) : null;
    const ranked = latest !== null;
    const prevRank = ranked
      ? rankOf(played.filter((m) => m.weekNumber !== latest))[userId] ?? rank
      : rank;

    out.push({
      leagueId: league.id,
      leagueName: league.name,
      members: members.length,
      rank,
      prevRank,
      // Rank 3 -> 2 is a rise, so the sign is inverted from the raw difference.
      change: prevRank - rank,
      ranked,
      balance: members.find((m) => m.userId === userId)?.balance ?? 0,
      betsThisWeek: betCounts.get(league.id) ?? 0,
    });
  }

  // Biggest riser first, then by rank. A card whose whole subject is movement
  // should lead with the league that moved.
  return out.sort((a, b) => b.change - a.change || a.rank - b.rank);
}

/**
 * How many wagers this user has standing on the current week, per league.
 *
 * Scoped by the week the GAME belongs to rather than by when the bet was
 * placed: a bet's `createdAt` says when someone opened the app, not which slate
 * it is riding on. Cashed-out wagers are excluded, the same as everywhere else
 * — the stake came back, so nothing is standing.
 *
 * A parlay counts once however many legs it has, matching betCounts.ts.
 */
async function standingBetsThisWeek(userId: string, leagueIds: string[]): Promise<Map<string, number>> {
  const counts = new Map<string, number>();

  // THE SHARED LADDER (services/currentWeek), not "the first unresolved week".
  // `Week.resolved` is a job-completion flag, not a clock: when the resolve is
  // late, that definition names a slate already played, and this card would
  // count last week's standing wagers as this week's.
  const week = await currentWeek();
  if (!week) return counts;

  const weekGames = await db.select({ id: games.id }).from(games).where(eq(games.weekId, week.id));
  if (weekGames.length === 0) return counts;

  const gameList = sql.join(weekGames.map((g) => sql`${g.id}`), sql`, `);
  const leagueList = sql.join(leagueIds.map((id) => sql`${id}`), sql`, `);

  const rows: any = await db.execute(sql`
    SELECT "leagueId", SUM(c)::int AS count FROM (
      SELECT pk."leagueId", COUNT(*)::int AS c
        FROM "Pick" pk
        JOIN "Prop" pr ON pr.id = pk."propId"
       WHERE pr."gameId" IN (${gameList}) AND pk."userId" = ${userId}
         AND pk."leagueId" IN (${leagueList}) AND pk."cashedOut" = false
       GROUP BY pk."leagueId"

      UNION ALL

      SELECT gp."leagueId", COUNT(*)::int AS c
        FROM "GamePick" gp
        JOIN "GameLine" gl ON gl.id = gp."gameLineId"
       WHERE gl."gameId" IN (${gameList}) AND gp."userId" = ${userId}
         AND gp."leagueId" IN (${leagueList}) AND gp."cashedOut" = false
       GROUP BY gp."leagueId"

      UNION ALL

      SELECT legs."leagueId", COUNT(DISTINCT legs."parlayId")::int AS c
        FROM (
          SELECT pa.id AS "parlayId", pa."leagueId", COALESCE(p."gameId", gl."gameId") AS "gameId"
            FROM "ParlayLeg" pl
            JOIN "Parlay" pa ON pa.id = pl."parlayId"
                            AND pa."cashedOut" = false
                            AND pa."userId" = ${userId}
                            AND pa."leagueId" IN (${leagueList})
            LEFT JOIN "Prop" p ON p.id = pl."propId"
            LEFT JOIN "GameLine" gl ON gl.id = pl."gameLineId"
        ) legs
       WHERE legs."gameId" IN (${gameList})
       GROUP BY legs."leagueId"
    ) t
    GROUP BY "leagueId"
  `);

  for (const r of Array.isArray(rows) ? rows : (rows?.rows ?? [])) {
    counts.set(r.leagueId, Number(r.count) || 0);
  }
  return counts;
}
