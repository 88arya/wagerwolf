import { prisma } from "../db/prisma";

export async function triggerPostWeekActions(resolvedWeekNumber: number): Promise<void> {
  const leagues = await prisma.league.findMany({
    where: { seasonStarted: true, seasonEnded: false },
  });

  for (const league of leagues) {
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
  const existing = await prisma.matchup.findFirst({ where: { leagueId, isPlayoff: true } });
  if (existing) return;

  const league = await prisma.league.findUnique({ where: { id: leagueId } }) as any;
  if (!league) return;

  const [memberships, matchups] = await Promise.all([
    prisma.membership.findMany({
      where: { leagueId, status: "ACTIVE" },
      include: { user: { select: { id: true, displayName: true } } },
    }),
    prisma.matchup.findMany({
      where: { leagueId, isPlayoff: false, OR: [{ winnerId: { not: null } }, { isTie: true }] },
    }),
  ]) as any[];

  const records: Record<string, { wins: number; losses: number; ties: number; balance: number }> = {};
  for (const m of memberships) records[m.userId] = { wins: 0, losses: 0, ties: 0, balance: m.balance };
  for (const mu of matchups) {
    if (mu.isTie) {
      if (records[mu.homeUserId]) records[mu.homeUserId].ties++;
      if (records[mu.awayUserId]) records[mu.awayUserId].ties++;
    } else if (mu.winnerId) {
      const loserId = mu.winnerId === mu.homeUserId ? mu.awayUserId : mu.homeUserId;
      if (records[mu.winnerId]) records[mu.winnerId].wins++;
      if (records[loserId]) records[loserId].losses++;
    }
  }

  const seeded = (memberships as any[])
    .map((m: any) => ({ userId: m.userId, displayName: m.user.displayName, ...records[m.userId] }))
    .sort((a: any, b: any) => b.wins - a.wins || b.balance - a.balance)
    .slice(0, league.playoffSize);

  if (seeded.length < 2) return;

  const n = seeded.length;
  const isPowerOf2 = (n & (n - 1)) === 0;

  if (isPowerOf2) {
    for (let i = 0; i < n / 2; i++) {
      await prisma.matchup.create({
        data: {
          leagueId, weekNumber,
          homeUserId: seeded[i].userId,
          awayUserId: seeded[n - 1 - i].userId,
          isPlayoff: true, playoffRound: 1,
        },
      });
    }
  } else {
    const nextPow2 = Math.pow(2, Math.floor(Math.log2(n - 1)));
    const byeCount = 2 * nextPow2 - n;
    for (let i = 0; i < byeCount; i++) {
      await prisma.matchup.create({
        data: {
          leagueId, weekNumber,
          homeUserId: seeded[i].userId,
          awayUserId: seeded[i].userId,
          winnerId: seeded[i].userId,
          isPlayoff: true, playoffRound: 1, isBye: true,
        },
      });
    }
    const playInTeams = seeded.slice(byeCount);
    for (let i = 0; i < playInTeams.length / 2; i++) {
      await prisma.matchup.create({
        data: {
          leagueId, weekNumber,
          homeUserId: playInTeams[i].userId,
          awayUserId: playInTeams[playInTeams.length - 1 - i].userId,
          isPlayoff: true, playoffRound: 1,
        },
      });
    }
  }

  console.log(`[playoffs] League ${leagueId} playoffs started for week ${weekNumber}`);
}

async function advancePlayoffs(leagueId: string, completedRound: number, nextWeekNumber: number): Promise<void> {
  const completedMatchups = await prisma.matchup.findMany({
    where: { leagueId, isPlayoff: true, playoffRound: completedRound },
    include: {
      homeUser: { select: { id: true, displayName: true } },
      awayUser: { select: { id: true, displayName: true } },
    },
  }) as any[];

  if (completedMatchups.length === 0) return;

  const unresolved = completedMatchups.filter((m: any) => !m.isBye && m.winnerId == null && !m.isTie).length;
  if (unresolved > 0) return;

  const winners = completedMatchups.map((m: any) => ({
    userId: m.winnerId ?? m.homeUserId,
    displayName: m.winnerId
      ? (m.winnerId === m.homeUserId ? m.homeUser.displayName : m.awayUser.displayName)
      : m.homeUser.displayName,
  }));

  if (winners.length === 1) {
    await prisma.league.update({
      where: { id: leagueId },
      data: { seasonEnded: true, championId: winners[0].userId },
    });
    console.log(`[playoffs] League ${leagueId} complete — champion: ${winners[0].displayName}`);
    return;
  }

  const n = winners.length;
  const nextRound = completedRound + 1;
  for (let i = 0; i < Math.floor(n / 2); i++) {
    await prisma.matchup.create({
      data: {
        leagueId, weekNumber: nextWeekNumber,
        homeUserId: winners[i].userId,
        awayUserId: winners[n - 1 - i].userId,
        isPlayoff: true, playoffRound: nextRound,
      },
    });
  }

  console.log(`[playoffs] League ${leagueId} advanced to round ${nextRound} (week ${nextWeekNumber})`);
}
