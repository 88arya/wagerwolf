import { prisma } from "../db/prisma";

export async function distributeWeeklyAllowances(weekNumber: number): Promise<number> {
  const leagues = await prisma.league.findMany({
    where: { seasonStarted: true, seasonEnded: false },
    include: { memberships: { where: { status: "ACTIVE" } } },
  });

  let count = 0;
  for (const league of leagues) {
    const maxWeek = league.startWeek + league.regularSeasonWeeks + league.playoffWeeks - 1;
    if (weekNumber < league.startWeek || weekNumber > maxWeek) continue;
    for (const membership of league.memberships) {
      await prisma.membership.update({
        where: { id: membership.id },
        data: { balance: league.weeklyAllowance, weeklyWinnings: 0 },
      });
      count++;
    }
  }

  console.log(`[allowances] Distributed allowances for week ${weekNumber} to ${count} members`);
  return count;
}
