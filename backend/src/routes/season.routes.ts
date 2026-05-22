import { Router } from "express";
import { prisma } from "../db/prisma";
import { requireAuth } from "../middleware/auth";
import { generateLeagueName } from "../services/leagueName";
import { startLeagueSeason } from "../services/startSeason";

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

router.post("/:leagueId/season/start", requireAuth, async (req: any, res: any) => {
  try {
    const { leagueId } = req.params;

    const league = await prisma.league.findUnique({
      where: { id: leagueId },
      select: { creatorId: true, seasonStarted: true, isPublic: true },
    }) as any;

    if (!league) { res.status(404).json({ error: "League not found" }); return; }
    if (league.creatorId !== req.userId) { res.status(403).json({ error: "Only the league creator can start the season" }); return; }
    if (league.seasonStarted) { res.status(400).json({ error: "Season already started" }); return; }

    const result = await startLeagueSeason(leagueId);

    if (league.isPublic) {
      await ensureOpenPublicLeague(league.creatorId);
    }

    res.json(result);
  } catch (err: any) {
    if (err.message === "Need at least 2 members to start") {
      res.status(400).json({ error: err.message }); return;
    }
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
