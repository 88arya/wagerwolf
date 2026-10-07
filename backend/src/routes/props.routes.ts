import { Router } from "express";
import { db } from "../db/db";
import { eq, and, inArray } from "drizzle-orm";
import { props, games } from "../db/schema";
import { requireAuth, requireCron } from "../middleware/auth";
import { invalidateGameMarkets } from "../services/weekBoard";

const router = Router();

router.post("/", requireAuth, requireCron, async (req: any, res: any, next: any) => {
  try {
    const { gameId, playerId, statType, line } = req.body;
    if (!gameId || !playerId || !statType || line == null) {
      res.status(400).json({ error: "gameId, playerId, statType, and line are required" });
      return;
    }
    const [prop] = await db.insert(props).values({ gameId, playerId, statType, line: Number(line) }).returning();
    invalidateGameMarkets(gameId);
    res.status(201).json(prop);
  } catch (err: any) {
    next(err); return;
  }
});

router.get("/", requireAuth, async (req: any, res: any, next: any) => {
  try {
    const { weekId } = req.query;
    if (weekId) {
      const weekGames = await db.select({ id: games.id }).from(games).where(eq(games.weekId, String(weekId)));
      const gameIds = weekGames.map((g) => g.id);
      if (gameIds.length === 0) { res.json([]); return; }
      const rows = await db.query.props.findMany({
        where: and(inArray(props.gameId, gameIds), eq(props.available, true)),
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
    next(err); return;
  }
});

export default router;
