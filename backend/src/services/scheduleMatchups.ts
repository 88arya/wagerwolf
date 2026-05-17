import { prisma } from "../db/prisma";

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
  const league = await prisma.league.findUnique({
    where: { id: leagueId },
    include: { memberships: { where: { status: "ACTIVE" }, select: { userId: true } } },
  }) as any;

  if (!league || league.seasonStarted) return;

  let userIds: string[] = league.memberships.map((m: any) => m.userId);

  if (userIds.length < 2) {
    await prisma.matchup.deleteMany({ where: { leagueId, isPlayoff: false, isConsolation: false } });
    return;
  }

  let ghostUserId: string | null = null;
  let hasGhost = false;

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

  // Delete all existing pre-season regular matchups
  await prisma.matchup.deleteMany({ where: { leagueId, isPlayoff: false, isConsolation: false } });

  const rounds = generateRoundRobin(userIds);
  const totalRounds = Math.min(rounds.length, league.regularSeasonWeeks);

  for (let i = 0; i < totalRounds; i++) {
    const weekNumber = league.startWeek + i;
    for (const [homeUserId, awayUserId] of rounds[i]) {
      const isGhostMatchup = homeUserId === ghostUserId || awayUserId === ghostUserId;
      await prisma.matchup.create({
        data: { leagueId, weekNumber, homeUserId, awayUserId, isGhostMatchup },
      });
    }
  }

  if (hasGhost !== league.hasGhost) {
    await prisma.league.update({ where: { id: leagueId }, data: { hasGhost } });
  }
}
