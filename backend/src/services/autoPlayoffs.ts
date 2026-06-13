import { db } from "../db/db";
import { eq, and } from "drizzle-orm";
import { leagues, matchups, memberships } from "../db/schema";

export async function triggerPostWeekActions(resolvedWeekNumber: number): Promise<void> {
  const allLeagues = await db.query.leagues.findMany({
    where: (l, { and, eq }) => and(eq(l.seasonStarted, true), eq(l.seasonEnded, false)),
  });

  for (const league of allLeagues) {
    const lastRegularWeek = league.startWeek + league.regularSeasonWeeks - 1;
    const lastPlayoffWeek = lastRegularWeek + league.playoffWeeks;

    try {
      if (resolvedWeekNumber === lastRegularWeek) {
        await startPlayoffs(league.id, resolvedWeekNumber + 1);
      } else if (resolvedWeekNumber > lastRegularWeek && resolvedWeekNumber <= lastPlayoffWeek) {
        const completedRound = resolvedWeekNumber - lastRegularWeek;
        await advancePlayoffs(league.id, completedRound, resolvedWeekNumber + 1);
      }
    } catch (err) {
      console.error(`[playoffs] League ${league.id} week ${resolvedWeekNumber}:`, err);
    }
  }
}

async function startPlayoffs(leagueId: string, weekNumber: number): Promise<void> {
  const existing = await db.query.matchups.findFirst({
    where: (m, { and, eq }) => and(eq(m.leagueId, leagueId), eq(m.isPlayoff, true)),
  });
  if (existing) return;

  const league = await db.query.leagues.findFirst({ where: eq(leagues.id, leagueId) });
  if (!league) return;

  const [leagueMembers, leagueMatchups] = await Promise.all([
    db.query.memberships.findMany({
      where: (m, { and, eq }) => and(eq(m.leagueId, leagueId), eq(m.status, "ACTIVE")),
      with: { user: true },
    }),
    db.query.matchups.findMany({
      where: (m, { and, eq, isNotNull, or }) =>
        and(
          eq(m.leagueId, leagueId),
          eq(m.isPlayoff, false),
          or(isNotNull(m.winnerId), eq(m.isTie, true))
        ),
    }),
  ]);

  const records: Record<string, { wins: number; losses: number; ties: number; balance: number }> = {};
  for (const m of leagueMembers) {
    records[m.userId] = { wins: 0, losses: 0, ties: 0, balance: m.balance };
  }
  for (const mu of leagueMatchups) {
    if (mu.isTie) {
      if (records[mu.homeUserId]) records[mu.homeUserId].ties++;
      if (records[mu.awayUserId]) records[mu.awayUserId].ties++;
    } else if (mu.winnerId) {
      const loserId = mu.winnerId === mu.homeUserId ? mu.awayUserId : mu.homeUserId;
      if (records[mu.winnerId]) records[mu.winnerId].wins++;
      if (records[loserId]) records[loserId].losses++;
    }
  }

  const seeded = leagueMembers
    .map((m) => ({ userId: m.userId, displayName: (m as any).user.displayName, ...records[m.userId] }))
    .sort((a, b) => b.wins - a.wins || b.balance - a.balance)
    .slice(0, league.playoffSize);

  if (seeded.length < 2) return;

  const n = seeded.length;
  const isPowerOf2 = (n & (n - 1)) === 0;

  if (isPowerOf2) {
    for (let i = 0; i < n / 2; i++) {
      await db.insert(matchups).values({
        leagueId, weekNumber,
        homeUserId: seeded[i].userId,
        awayUserId: seeded[n - 1 - i].userId,
        isPlayoff: true, playoffRound: 1,
      });
    }
  } else {
    const nextPow2 = Math.pow(2, Math.floor(Math.log2(n - 1)));
    const byeCount = 2 * nextPow2 - n;
    for (let i = 0; i < byeCount; i++) {
      await db.insert(matchups).values({
        leagueId, weekNumber,
        homeUserId: seeded[i].userId,
        awayUserId: seeded[i].userId,
        winnerId: seeded[i].userId,
        isPlayoff: true, playoffRound: 1, isBye: true,
      });
    }
    const playInTeams = seeded.slice(byeCount);
    for (let i = 0; i < playInTeams.length / 2; i++) {
      await db.insert(matchups).values({
        leagueId, weekNumber,
        homeUserId: playInTeams[i].userId,
        awayUserId: playInTeams[playInTeams.length - 1 - i].userId,
        isPlayoff: true, playoffRound: 1,
      });
    }
  }

  console.log(`[playoffs] League ${leagueId} playoffs started for week ${weekNumber}`);
}

async function advancePlayoffs(leagueId: string, completedRound: number, nextWeekNumber: number): Promise<void> {
  const completedMatchups = await db.query.matchups.findMany({
    where: (m, { and, eq }) =>
      and(eq(m.leagueId, leagueId), eq(m.isPlayoff, true), eq(m.playoffRound, completedRound)),
    with: { homeUser: true, awayUser: true },
  });

  if (completedMatchups.length === 0) return;

  const unresolved = completedMatchups.filter((m) => !m.isBye && m.winnerId == null && !m.isTie).length;
  if (unresolved > 0) return;

  const winners = completedMatchups.map((m) => ({
    userId: m.winnerId ?? m.homeUserId,
    displayName: m.winnerId
      ? (m.winnerId === m.homeUserId ? (m as any).homeUser.displayName : (m as any).awayUser.displayName)
      : (m as any).homeUser.displayName,
  }));

  if (winners.length === 1) {
    await db.update(leagues)
      .set({ seasonEnded: true, championId: winners[0].userId })
      .where(eq(leagues.id, leagueId));
    console.log(`[playoffs] League ${leagueId} complete — champion: ${winners[0].displayName}`);
    return;
  }

  const n = winners.length;
  const nextRound = completedRound + 1;
  for (let i = 0; i < Math.floor(n / 2); i++) {
    await db.insert(matchups).values({
      leagueId, weekNumber: nextWeekNumber,
      homeUserId: winners[i].userId,
      awayUserId: winners[n - 1 - i].userId,
      isPlayoff: true, playoffRound: nextRound,
    });
  }

  console.log(`[playoffs] League ${leagueId} advanced to round ${nextRound} (week ${nextWeekNumber})`);
}
