import { Router } from "express";
import { prisma } from "../db/prisma";
import { requireAuth } from "../middleware/auth";

const router = Router();

router.get("/", requireAuth, async (req: any, res: any) => {
  try {
    const memberships = await prisma.membership.findMany({
      where: { userId: req.userId },
      include: { league: true },
    });
    res.json(memberships);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/join-by-code", requireAuth, async (req: any, res: any) => {
  try {
    const { code } = req.body;
    if (!code) { res.status(400).json({ error: "Invite code required" }); return; }

    const league = await prisma.league.findUnique({
      where: { inviteCode: code.toUpperCase() },
    });
    if (!league) { res.status(404).json({ error: "Invalid invite code" }); return; }

    const membership = await prisma.membership.create({
      data: { userId: req.userId, leagueId: league.id, balance: 0 },
    });

    res.status(201).json({ ...membership, league });
  } catch (err: any) {
    if (err.code === "P2002") {
      res.status(409).json({ error: "Already a member of this league" });
    } else {
      res.status(500).json({ error: err.message });
    }
  }
});

export default router;
