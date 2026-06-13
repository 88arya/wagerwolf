import { Router } from "express";
import { db } from "../db/db";
import { eq, inArray, isNotNull } from "drizzle-orm";
import { props, games } from "../db/schema";
import { requireAuth, requireCron } from "../middleware/auth";

const router = Router();

router.post("/", requireAuth, requireCron, async (req: any, res: any) => {
  try {
    const { gameId, playerId, statType, line } = req.body;
    if (!gameId || !playerId || !statType || line == null) {
      res.status(400).json({ error: "gameId, playerId, statType, and line are required" });
      return;
    }
    const [prop] = await db.insert(props).values({ gameId, playerId, statType, line: Number(line) }).returning();
    res.status(201).json(prop);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/hit-rates", requireAuth, async (req: any, res: any) => {
  try {
    const resolvedProps = await db.select({
      playerId: props.playerId,
      statType: props.statType,
      line: props.line,
      result: props.result,
    }).from(props).where(isNotNull(props.result));

    const counts: Record<string, { over: number; under: number }> = {};
    for (const p of resolvedProps) {
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
    if (weekId) {
      const weekGames = await db.select({ id: games.id }).from(games).where(eq(games.weekId, String(weekId)));
      const gameIds = weekGames.map((g) => g.id);
      if (gameIds.length === 0) { res.json([]); return; }
      const rows = await db.query.props.findMany({
        where: inArray(props.gameId, gameIds),
        with: { player: true, game: true },
      });
      res.json(rows);
    } else {
      const rows = await db.query.props.findMany({
        with: { player: true, game: true },
      });
      res.json(rows);
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
