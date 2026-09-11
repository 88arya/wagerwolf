import { Router } from "express";
import { db } from "../db/db";
import { eq, asc } from "drizzle-orm";
import { players } from "../db/schema";
import { requireAuth, requireCron } from "../middleware/auth";
import { espnImageUrl } from "../services/espnApi";
import { resolvePlayerIdentity } from "../services/playerIdentity";

const router = Router();

router.post("/", requireAuth, requireCron, async (req: any, res: any, next: any) => {
  try {
    const { name, team, position } = req.body;
    if (!name || !team || !position) {
      res.status(400).json({ error: "name, team, and position are required" });
      return;
    }
    const [player] = await db.insert(players).values({ name, team, position }).returning();
    res.status(201).json(player);
  } catch (err: any) {
    next(err); return;
  }
});

router.get("/", requireAuth, async (req: any, res: any, next: any) => {
  try {
    const rows = await db.select().from(players).orderBy(asc(players.name));
    res.json(rows);
  } catch (err: any) {
    next(err); return;
  }
});

/**
 * The lazy path, and now only the SECOND chance.
 *
 * Identity is resolved when a player arrives from the odds sync — see
 * services/playerIdentity, which this delegates to so the two cannot drift.
 * This route remains because the sweep is best-effort: ESPN's search is a name
 * match and misses people, so a player it could not resolve still gets one more
 * attempt the first time someone actually looks at them.
 *
 * It used to be the ONLY place `espnId` was ever written, which meant the
 * landing page could never show a prop card on a fresh deployment. See the
 * header of services/playerIdentity for why that was backwards.
 */
router.get("/:id/image", requireAuth, async (req: any, res: any, next: any) => {
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
  } catch (err: any) {
    next(err); return;
  }
});

export default router;
