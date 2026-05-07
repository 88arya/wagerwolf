import { Router } from "express";
import { prisma } from "../db/prisma";

const router = Router();

router.post("/", async (req: any, res: any) => {
  try {
    const { gameId, playerId, statType, line } = req.body;
    if (!gameId || !playerId || !statType || line == null) {
      res.status(400).json({ error: "gameId, playerId, statType, and line are required" });
      return;
    }
    const prop = await prisma.prop.create({
      data: { gameId, playerId, statType, line: Number(line) },
    });
    res.status(201).json(prop);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/", async (req: any, res: any) => {
  try {
    const { weekId } = req.query;
    const props = await prisma.prop.findMany({
      where: weekId ? { game: { weekId: String(weekId) } } : undefined,
      include: { player: true, game: true },
    });
    res.json(props);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
