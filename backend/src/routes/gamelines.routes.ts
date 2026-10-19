import { Router } from "express";
import { db } from "../db/db";
import { eq } from "drizzle-orm";
import { gameLines } from "../db/schema";
import { requireAuth } from "../middleware/auth";

const router = Router();

router.get("/", requireAuth, async (req, res, next) => {
  try {
    const { gameId } = req.query;
    if (!gameId) { res.status(400).json({ error: "gameId is required" }); return; }

    const lines = await db.query.gameLines.findMany({
      where: eq(gameLines.gameId, String(gameId)),
      with: { game: true },
    });

    res.json(lines);
  } catch (err) {
    next(err); return;
  }
});

export default router;
