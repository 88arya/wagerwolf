import { db } from "../db/db";
import { eq, and } from "drizzle-orm";
import { leagues, matchups, users } from "../db/schema";

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

export function getNearestTuesdayNoon(from: Date): Date {
  const d = new Date(from);
  const day = d.getDay(); // 0=Sun, 1=Mon, 2=Tue
  let daysUntil = (2 - day + 7) % 7;
  if (daysUntil === 0) {
    // Today is Tuesday — check if noon has passed
    const noon = new Date(d);
    noon.setHours(12, 0, 0, 0);
    if (d >= noon) daysUntil = 7;
  }
  const result = new Date(d);
  result.setDate(d.getDate() + daysUntil);
  result.setHours(12, 0, 0, 0);
  return result;
}

export async function scheduleMatchups(leagueId: string): Promise<void> {
  const league = await db.query.leagues.findFirst({
    where: eq(leagues.id, leagueId),
    with: { memberships: true },
  });

  if (!league || league.seasonStarted) return;

  const activeMembers = (league.memberships as any[]).filter((m: any) => m.status === "ACTIVE");
  let userIds: string[] = activeMembers.map((m: any) => m.userId);

  if (userIds.length < 2) {
    await db.delete(matchups).where(
      and(eq(matchups.leagueId, leagueId), eq(matchups.isPlayoff, false), eq(matchups.isConsolation, false))
    );
    return;
  }

  let ghostUserId: string | null = null;
  let hasGhost = false;

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

  // Delete all existing pre-season regular matchups
  await db.delete(matchups).where(
    and(eq(matchups.leagueId, leagueId), eq(matchups.isPlayoff, false), eq(matchups.isConsolation, false))
  );

  const rounds = generateRoundRobin(userIds);
  const totalRounds = Math.min(rounds.length, league.regularSeasonWeeks);

  for (let i = 0; i < totalRounds; i++) {
    const weekNumber = league.startWeek + i;
    for (const [homeUserId, awayUserId] of rounds[i]) {
      const isGhostMatchup = homeUserId === ghostUserId || awayUserId === ghostUserId;
      await db.insert(matchups).values({ leagueId, weekNumber, homeUserId, awayUserId, isGhostMatchup });
    }
  }

  if (hasGhost !== league.hasGhost) {
    await db.update(leagues).set({ hasGhost }).where(eq(leagues.id, leagueId));
  }
}
