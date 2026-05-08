import { Router } from "express";
import { prisma } from "../db/prisma";
import { requireAuth } from "../middleware/auth";

const router = Router();

router.get("/", requireAuth, async (req: any, res: any) => {
  try {
    const { gameId } = req.query;
    if (!gameId) { res.status(400).json({ error: "gameId is required" }); return; }

    const lines = await prisma.gameLine.findMany({
      where: { gameId: String(gameId) },
      include: { game: true },
    });

    res.json(lines);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
