import { Router } from "express";
import { prisma } from "../db/prisma";
import { requireAuth } from "../middleware/auth";

const router = Router({ mergeParams: true });

router.post("/join", requireAuth, async (req: any, res: any) => {
  try {
    const { id: leagueId } = req.params;
    const userId = req.userId;

    const league = await prisma.league.findUnique({ where: { id: leagueId } });
    if (!league) { res.status(404).json({ error: "League not found" }); return; }

    const membership = await prisma.membership.create({
      data: { userId, leagueId, balance: 0 },
    });

    res.status(201).json(membership);
  } catch (err: any) {
    if (err.code === "P2002") {
      res.status(409).json({ error: "Already a member of this league" });
    } else {
      res.status(500).json({ error: err.message });
    }
  }
});


router.get("/leaderboard", requireAuth, async (req: any, res: any) => {
  try {
    const { id: leagueId } = req.params;

    const memberships = await prisma.membership.findMany({
      where: { leagueId },
      orderBy: { balance: "desc" },
      include: { user: { select: { id: true, displayName: true } } },
    }) as any[];

    const leaderboard = memberships.map((m, i) => ({
      rank: i + 1,
      userId: m.user.id,
      displayName: m.user.displayName,
      balance: m.balance,
    }));

    res.json(leaderboard);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.delete("/members/:memberId", requireAuth, async (req: any, res: any) => {
  try {
    const { id: leagueId, memberId } = req.params;

    const league = await prisma.league.findUnique({ where: { id: leagueId } });
    if (!league) { res.status(404).json({ error: "League not found" }); return; }
    if (league.creatorId !== req.userId) {
      res.status(403).json({ error: "Only the league creator can remove members" });
      return;
    }
    if (memberId === req.userId) {
      res.status(400).json({ error: "Cannot remove yourself" });
      return;
    }

    await prisma.membership.deleteMany({ where: { userId: memberId, leagueId } });
    res.json({ message: "Member removed" });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
