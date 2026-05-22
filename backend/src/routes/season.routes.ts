import { Router } from "express";
import { prisma } from "../db/prisma";
import { requireAuth } from "../middleware/auth";
import { generateLeagueName } from "../services/leagueName";
import { distributeWeeklyAllowances } from "../services/distributeAllowances";

const MAX_NFL_WEEK = 17;

async function ensureOpenPublicLeague(creatorId: string) {
  const open = await prisma.league.findFirst({
    where: { isPublic: true, seasonStarted: false },
    include: { memberships: { where: { status: "ACTIVE" }, select: { id: true } } },
  }) as any;
  if (open && open.memberships.length < open.maxPlayers) return;

  const playoffSize = 6;
  const playoffWeeks = Math.ceil(Math.log2(playoffSize));
  const maxPlayers = 10;

  const firstUnresolved = await prisma.week.findFirst({ where: { resolved: false }, orderBy: { number: "asc" } });
  let startWeek = 1;
  if (firstUnresolved) startWeek = firstUnresolved.number === 1 ? 2 : firstUnresolved.number;
  const regularSeasonWeeks = Math.max(1, MAX_NFL_WEEK - startWeek - playoffWeeks + 1);

  let inviteCode = Math.random().toString(36).substring(2, 8).toUpperCase();
  while (await prisma.league.findUnique({ where: { inviteCode } })) {
    inviteCode = Math.random().toString(36).substring(2, 8).toUpperCase();
  }

  await prisma.league.create({
    data: {
      name: generateLeagueName(),
      weeklyAllowance: 300,
      inviteCode,
      creatorId,
      isPublic: true,
      maxPlayers,
      startWeek,
      regularSeasonWeeks,
      playoffWeeks,
      playoffSize,
      consolationTeams: 0,
      consolationWeeks: 0,
    },
  });
}

const router = Router();

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

router.post("/:leagueId/season/start", requireAuth, async (req: any, res: any) => {
  try {
    const { leagueId } = req.params;

    const league = await prisma.league.findUnique({
      where: { id: leagueId },
      include: { memberships: { where: { status: "ACTIVE" }, include: { user: true } } },
    }) as any;

    if (!league) { res.status(404).json({ error: "League not found" }); return; }
    if (league.creatorId !== req.userId) { res.status(403).json({ error: "Only the league creator can start the season" }); return; }
    if (league.seasonStarted) { res.status(400).json({ error: "Season already started" }); return; }

    const members = league.memberships;
    if (members.length < 2) { res.status(400).json({ error: "Need at least 2 members to start" }); return; }

    let userIds = members.map((m: any) => m.userId);
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
    const matchupData = [];
    for (let i = 0; i < totalRounds; i++) {
      const weekNumber = league.startWeek + i;
      for (const [homeUserId, awayUserId] of rounds[i]) {
        const isGhostMatchup = homeUserId === ghostUserId || awayUserId === ghostUserId;
        matchupData.push({ leagueId, weekNumber, homeUserId, awayUserId, isGhostMatchup });
      }
    }
    await prisma.matchup.createMany({ data: matchupData, skipDuplicates: true });

    await prisma.league.update({ where: { id: leagueId }, data: { seasonStarted: true, hasGhost } });

    // Distribute weekly allowances for the first week
    try {
      await distributeWeeklyAllowances(league.startWeek);
      await prisma.week.updateMany({
        where: { number: league.startWeek },
        data: { allowanceDistributed: true },
      });
    } catch { /* week may not exist yet — will be handled by scheduler */ }

    if (league.isPublic) {
      await ensureOpenPublicLeague(league.creatorId);
    }

    res.json({ weeks: totalRounds });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/:leagueId/matchups", requireAuth, async (req: any, res: any) => {
  try {
    const { leagueId } = req.params;
    const { weekNumber } = req.query;

    const [matchups, memberships] = await Promise.all([
      prisma.matchup.findMany({
        where: { leagueId, ...(weekNumber ? { weekNumber: Number(weekNumber) } : {}) },
        include: {
          homeUser: { select: { id: true, displayName: true, email: true } },
          awayUser: { select: { id: true, displayName: true, email: true } },
        },
        orderBy: { weekNumber: "asc" },
      }),
      prisma.membership.findMany({
        where: { leagueId, status: "ACTIVE" },
        select: { userId: true, displayName: true, user: { select: { displayName: true } } },
      }),
    ]);
    const nameMap: Record<string, string> = {};
    for (const m of memberships as any[]) nameMap[m.userId] = m.displayName || m.user.displayName;

    const augmented = (matchups as any[]).map((mu) => ({
      ...mu,
      homeUser: { ...mu.homeUser, displayName: nameMap[mu.homeUser?.id] ?? mu.homeUser?.displayName },
      awayUser: { ...mu.awayUser, displayName: nameMap[mu.awayUser?.id] ?? mu.awayUser?.displayName },
    }));

    res.json(augmented);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
