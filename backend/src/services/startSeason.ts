import { prisma } from "../db/prisma";
import { distributeWeeklyAllowances } from "./distributeAllowances";

function generateRoundRobin(userIds: string[]): Array<[string, string][]> {
  const n = userIds.length;
  const ids = [...userIds];
  const rounds: Array<[string, string][]> = [];
  for (let round = 0; round < n - 1; round++) {
    const pairs: [string, string][] = [];
    for (let i = 0; i < n / 2; i++) {
      pairs.push([ids[i], ids[n - 1 - i]]);
    }
    rounds.push(pairs);
    const last = ids.pop()!;
    ids.splice(1, 0, last);
  }
  return rounds;
}

export async function startLeagueSeason(leagueId: string): Promise<{ weeks: number }> {
  const league = await prisma.league.findUnique({
    where: { id: leagueId },
    include: { memberships: { where: { status: "ACTIVE" }, include: { user: true } } },
  }) as any;

  if (!league) throw new Error("League not found");
  if (league.seasonStarted) throw new Error("Season already started");

  const members = league.memberships;
  if (members.length < 1) throw new Error("Need at least 1 member to start");

  let userIds: string[] = members.map((m: any) => m.userId);
  let hasGhost = false;
  let ghostUserId: string | null = null;

  if (userIds.length % 2 !== 0) {
    hasGhost = true;
    let ghost = await prisma.user.findUnique({ where: { email: "ghost@system.internal" } });
    if (!ghost) {
      ghost = await prisma.user.create({
        data: { email: "ghost@system.internal", password: "", name: "Ghost", displayName: "Ghost" },
      });
    }
    ghostUserId = ghost.id;
    userIds = [...userIds, ghostUserId];
  }

  await prisma.matchup.deleteMany({ where: { leagueId, isPlayoff: false, isConsolation: false } });

  const rounds = generateRoundRobin(userIds);
  const totalRounds = Math.min(rounds.length, league.regularSeasonWeeks);
  const matchupData: any[] = [];
  for (let i = 0; i < totalRounds; i++) {
    const weekNumber = league.startWeek + i;
    for (const [homeUserId, awayUserId] of rounds[i]) {
      const isGhostMatchup = homeUserId === ghostUserId || awayUserId === ghostUserId;
      matchupData.push({ leagueId, weekNumber, homeUserId, awayUserId, isGhostMatchup });
    }
  }
  await prisma.matchup.createMany({ data: matchupData, skipDuplicates: true });

  await prisma.league.update({ where: { id: leagueId }, data: { seasonStarted: true, hasGhost } });

  try {
    await distributeWeeklyAllowances(league.startWeek);
    await prisma.week.updateMany({
      where: { number: league.startWeek },
      data: { allowanceDistributed: true },
    });
  } catch { /* week may not exist yet — scheduler will handle it */ }

  console.log(`[season] League ${leagueId} started — ${totalRounds} weeks scheduled`);
  return { weeks: totalRounds };
}
