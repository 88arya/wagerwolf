import { Router } from "express";
import { prisma } from "../db/prisma";
import { requireAuth, requireAdmin } from "../middleware/auth";

const router = Router();

router.post("/", requireAuth, requireAdmin, async (req: any, res: any) => {
  try {
    const { weekId, homeTeam, awayTeam, gameDate } = req.body;
    if (!weekId || !homeTeam || !awayTeam || !gameDate) {
      res.status(400).json({ error: "weekId, homeTeam, awayTeam, and gameDate are required" });
      return;
    }
    const game = await prisma.game.create({
      data: { weekId, homeTeam, awayTeam, gameDate: new Date(gameDate) },
    });
    res.status(201).json(game);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
