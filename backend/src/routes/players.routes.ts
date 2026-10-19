import { Router } from "express";
import { db } from "../db/db";
import { eq, asc } from "drizzle-orm";
import { players } from "../db/schema";
import { requireAuth, requireCron } from "../middleware/auth";
import { espnImageUrl } from "../services/espnApi";
import { resolvePlayerIdentity } from "../services/playerIdentity";

const router = Router();

router.post("/", requireAuth, requireCron, async (req, res, next) => {
  try {
    const { name, team, position } = req.body;
    if (!name || !team || !position) {
      res.status(400).json({ error: "name, team, and position are required" });
      return;
    }
    const [player] = await db.insert(players).values({ name, team, position }).returning();
    res.status(201).json(player);
  } catch (err) {
    next(err); return;
  }
});

router.get("/", requireAuth, async (_req, res, next) => {
  try {
    const rows = await db.select().from(players).orderBy(asc(players.name));
    res.json(rows);
  } catch (err) {
    next(err); return;
  }
});

router.get("/:id/image", requireAuth, async (req, res, next) => {
  try {
    const [player] = await db.select().from(players).where(eq(players.id, req.params.id)).limit(1);
    if (!player) { res.status(404).json({ error: "Not found" }); return; }

    const identity = await resolvePlayerIdentity(player as any);
    if (!identity) { res.json({ imageUrl: null, jersey: null }); return; }

    res.json({
      imageUrl: espnImageUrl(identity.espnId),
      jersey: identity.jersey,
      position: identity.position,
    });
  } catch (err) {
    next(err); return;
  }
});

export default router;
