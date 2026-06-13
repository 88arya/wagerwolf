import { db } from "../db/db";
import { eq, and } from "drizzle-orm";
import { leagues, matchups, users, weeks } from "../db/schema";
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
  const league = await db.query.leagues.findFirst({
    where: eq(leagues.id, leagueId),
    with: { memberships: { with: { user: true } } },
  });

  if (!league) throw new Error("League not found");
  if (league.seasonStarted) throw new Error("Season already started");

  const members = (league.memberships as any[]).filter((m: any) => m.status === "ACTIVE");
  if (members.length < 1) throw new Error("Need at least 1 member to start");

  let userIds: string[] = members.map((m: any) => m.userId);
  let hasGhost = false;
  let ghostUserId: string | null = null;

  if (userIds.length % 2 !== 0) {
    hasGhost = true;
    let ghost = await db.query.users.findFirst({ where: eq(users.email, "ghost@system.internal") });
    if (!ghost) {
      [ghost] = await db.insert(users).values({
        email: "ghost@system.internal", password: "", name: "Ghost", displayName: "Ghost",
      }).returning();
    }
    ghostUserId = ghost!.id;
    userIds = [...userIds, ghostUserId];
  }

  await db.delete(matchups).where(
    and(eq(matchups.leagueId, leagueId), eq(matchups.isPlayoff, false), eq(matchups.isConsolation, false))
  );

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
  if (matchupData.length > 0) {
    await db.insert(matchups).values(matchupData).onConflictDoNothing();
  }

  await db.update(leagues).set({ seasonStarted: true, hasGhost }).where(eq(leagues.id, leagueId));

  try {
    await distributeWeeklyAllowances(league.startWeek);
    await db.update(weeks)
      .set({ allowanceDistributed: true })
      .where(eq(weeks.number, league.startWeek));
  } catch { /* week may not exist yet — scheduler will handle it */ }

  console.log(`[season] League ${leagueId} started — ${totalRounds} weeks scheduled`);
  return { weeks: totalRounds };
}
