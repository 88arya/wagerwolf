import { Router } from "express";
import { prisma } from "../db/prisma";
import { requireAuth, requireAdmin } from "../middleware/auth";

const router = Router();

router.get("/leagues", requireAuth, requireAdmin, async (req: any, res: any) => {
  try {
    const leagues = await prisma.league.findMany({
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { memberships: true } } },
    });
    res.json(leagues);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Create a standardized public league (admin only)
router.post("/leagues/public", requireAuth, requireAdmin, async (req: any, res: any) => {
  try {
    const maxTeams = 10;
    const weeklyAllowance = 300;
    const playoffSize = 6;
    const playoffWeeks = Math.ceil(Math.log2(playoffSize)); // 3
    const consolationTeams = maxTeams - playoffSize; // 4
    const consolationWeeks = 2;

    const firstUnresolved = await prisma.week.findFirst({
      where: { resolved: false },
      orderBy: { number: "asc" },
    });
    let startWeek = 1;
    if (firstUnresolved) {
      startWeek = firstUnresolved.number === 1 ? 2 : firstUnresolved.number;
    }

    const regularSeasonWeeks = Math.max(1, 18 - startWeek - playoffWeeks + 1);

    let inviteCode = Math.random().toString(36).substring(2, 8).toUpperCase();
    while (await prisma.league.findUnique({ where: { inviteCode } })) {
      inviteCode = Math.random().toString(36).substring(2, 8).toUpperCase();
    }

    const count = await prisma.league.count({ where: { isPublic: true } });

    const league = await prisma.league.create({
      data: {
        name: `Public League ${count + 1}`,
        weeklyAllowance,
        inviteCode,
        creatorId: req.userId,
        isPublic: true,
        maxTeams,
        startWeek,
        regularSeasonWeeks,
        playoffWeeks,
        playoffSize,
        consolationTeams,
        consolationWeeks,
      },
    });

    res.status(201).json(league);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/leagues/delete-all", requireAuth, requireAdmin, async (req: any, res: any) => {
  try {
    await prisma.parlayLeg.deleteMany({});
    await prisma.parlay.deleteMany({});
    await prisma.gamePick.deleteMany({});
    await prisma.pick.deleteMany({});
    await prisma.matchup.deleteMany({});
    await prisma.membership.deleteMany({});
    await prisma.league.deleteMany({});
    res.json({ message: "All leagues deleted" });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
