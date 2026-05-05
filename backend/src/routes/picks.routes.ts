import { Router } from "express";
import { prisma } from "../db/prisma";

const router = Router();

router.post("/", async (req, res) => {
  const { userId, leagueId, propId, direction, stake } = req.body;

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
