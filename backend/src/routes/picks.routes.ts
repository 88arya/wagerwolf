import { Router } from "express";
import { prisma } from "../db/prisma";
import { requireAuth } from "../middleware/auth";

const router = Router();

router.post("/", requireAuth, async (req: any, res: any) => {
  try {
    const { leagueId, propId, direction, stake } = req.body;
    const userId = req.userId;

    if (!leagueId || !propId || !direction || stake == null) {
      res.status(400).json({ error: "leagueId, propId, direction, and stake are required" });
      return;
    }
    if (Number(stake) <= 0) {
      res.status(400).json({ error: "Stake must be greater than 0" });
      return;
    }

    const prop = await prisma.prop.findUnique({
      where: { id: propId },
      include: { game: { include: { week: true } } },
    }) as any;

    if (!prop) { res.status(404).json({ error: "Prop not found" }); return; }
    if (prop.game.week.locked) { res.status(400).json({ error: "This week is locked" }); return; }
    if (prop.game.week.resolved) { res.status(400).json({ error: "This week is already resolved" }); return; }

    const membership = await prisma.membership.findUnique({
      where: { userId_leagueId: { userId, leagueId } },
    });
    if (!membership) { res.status(404).json({ error: "Not a member of this league" }); return; }
    if (membership.balance < Number(stake)) {
      res.status(400).json({ error: "Insufficient balance" });
      return;
    }

    const existing = await prisma.pick.findUnique({
      where: { userId_leagueId_propId: { userId, leagueId, propId } },
    });
    if (existing) { res.status(409).json({ error: "Already placed a bet on this prop" }); return; }

    const [pick] = await prisma.$transaction([
      prisma.pick.create({ data: { userId, leagueId, propId, direction, stake: Number(stake) } }),
      prisma.membership.update({
        where: { userId_leagueId: { userId, leagueId } },
        data: { balance: { decrement: Number(stake) } },
      }),
    ]);

    res.status(201).json(pick);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/", requireAuth, async (req: any, res: any) => {
  try {
    const { leagueId } = req.query;

    const picks = await prisma.pick.findMany({
      where: {
        userId: req.userId,
        ...(leagueId ? { leagueId: String(leagueId) } : {}),
      },
      include: { prop: { include: { player: true, game: { include: { week: true } } } } },
      orderBy: { createdAt: "desc" },
    });

    res.json(picks);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
