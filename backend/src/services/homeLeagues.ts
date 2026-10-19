import { and, eq, inArray, isNotNull, or, sql } from "drizzle-orm";
import { db } from "../db/db";
import { memberships, matchups, leagues, games } from "../db/schema";
import { tallyRecords, compareStandings } from "./standings";
import { currentWeek } from "./currentWeek";

// Power rankings card on /home. Ranks come from standings.ts so they match the
// league leaderboard. Lobby leagues are skipped.

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

  return out.sort((a, b) => b.change - a.change || a.rank - b.rank);
}

async function standingBetsThisWeek(userId: string, leagueIds: string[]): Promise<Map<string, number>> {
  const counts = new Map<string, number>();

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
