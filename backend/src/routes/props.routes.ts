import { Router } from "express";
import { prisma } from "../db/prisma";
import { requireAuth, requireCron } from "../middleware/auth";

const router = Router();

router.post("/", requireAuth, requireCron, async (req: any, res: any) => {
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

router.get("/hit-rates", requireAuth, async (req: any, res: any) => {
  try {
    const props = await prisma.prop.findMany({
      where: { result: { not: null } },
      select: { playerId: true, statType: true, line: true, result: true },
    });

    const counts: Record<string, { over: number; under: number }> = {};
    for (const p of props) {
      const key = `${p.playerId}:${p.statType}`;
      if (!counts[key]) counts[key] = { over: 0, under: 0 };
      if (p.result! > p.line) counts[key].over++;
      else if (p.result! < p.line) counts[key].under++;
    }

    const result: Record<string, { overPct: number; sampleSize: number }> = {};
    for (const [key, c] of Object.entries(counts)) {
      const total = c.over + c.under;
      if (total === 0) continue;
      result[key] = { overPct: Math.round((c.over / total) * 100), sampleSize: total };
    }

    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/", requireAuth, async (req: any, res: any) => {
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
