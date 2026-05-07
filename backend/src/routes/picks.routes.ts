import { Router } from "express";
import { prisma } from "../db/prisma";

const router = Router();

router.post("/", async (req: any, res: any) => {
  const { userId, leagueId, propId, direction, stake } = req.body;

  const membership = await prisma.membership.findUnique({
    where: { userId_leagueId: { userId, leagueId } },
  });

  if (!membership) {
    res.status(404).json({ error: "Not a member of this league" });
    return;
  }

  if (membership.balance < stake) {
    res.status(400).json({ error: "Insufficient balance" });
    return;
  }

  const existing = await prisma.pick.findUnique({
    where: { userId_leagueId_propId: { userId, leagueId, propId } },
  });

  if (existing) {
    res.status(409).json({ error: "Already placed a bet on this prop" });
    return;
  }

  const pick = await prisma.pick.create({
    data: { userId, leagueId, propId, direction, stake },
  });

  res.status(201).json(pick);
});

router.get("/", async (req, res) => {
  const { userId, leagueId } = req.query;

  const picks = await prisma.pick.findMany({
    where: {
      ...(userId ? { userId: String(userId) } : {}),
      ...(leagueId ? { leagueId: String(leagueId) } : {}),
    },
    include: { prop: { include: { player: true, game: true } } },
  });

  res.json(picks);
});

export default router;
