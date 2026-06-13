import { db } from "../db/db";
import { eq, and } from "drizzle-orm";
import { leagues, memberships } from "../db/schema";

export async function distributeWeeklyAllowances(weekNumber: number): Promise<number> {
  const allLeagues = await db.query.leagues.findMany({
    where: (l, { and, eq }) => and(eq(l.seasonStarted, true), eq(l.seasonEnded, false)),
    with: { memberships: true },
  });

  let count = 0;
  for (const league of allLeagues) {
    const maxWeek = league.startWeek + league.regularSeasonWeeks + league.playoffWeeks - 1;
    if (weekNumber < league.startWeek || weekNumber > maxWeek) continue;
    const activeMembers = (league.memberships as any[]).filter((m: any) => m.status === "ACTIVE");
    for (const membership of activeMembers) {
      await db.update(memberships)
        .set({ balance: league.weeklyAllowance, weeklyWinnings: 0 })
        .where(eq(memberships.id, membership.id));
      count++;
    }
  }

  console.log(`[allowances] Distributed allowances for week ${weekNumber} to ${count} members`);
  return count;
}
