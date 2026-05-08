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
