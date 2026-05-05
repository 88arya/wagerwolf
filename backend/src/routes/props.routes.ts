import { Router } from "express";
import { prisma } from "../db/prisma";

const router = Router();

router.post("/", async (req, res) => {
  const { gameId, playerId, statType, line } = req.body;

  const prop = await prisma.prop.create({
    data: { gameId, playerId, statType, line },
  });

  res.status(201).json(prop);
});

router.get("/", async (req, res) => {
  const { weekId } = req.query;

  const props = await prisma.prop.findMany({
    where: weekId ? { game: { weekId: String(weekId) } } : undefined,
    include: { player: true, game: true },
  });

  res.json(props);
});

export default router;
