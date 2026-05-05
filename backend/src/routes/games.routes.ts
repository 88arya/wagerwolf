import { Router } from "express";
import { prisma } from "../db/prisma";

const router = Router();

router.post("/", async (req, res) => {
  const { weekId, homeTeam, awayTeam, gameDate } = req.body;

  const game = await prisma.game.create({
    data: { weekId, homeTeam, awayTeam, gameDate: new Date(gameDate) },
  });

  res.status(201).json(game);
});

export default router;
