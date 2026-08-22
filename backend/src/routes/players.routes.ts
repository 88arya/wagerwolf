import { Router } from "express";
import { db } from "../db/db";
import { eq, asc } from "drizzle-orm";
import { players } from "../db/schema";
import { requireAuth, requireCron } from "../middleware/auth";
import { searchEspnPlayerId, espnImageUrl, getAthleteDetails } from "../services/espnApi";

const router = Router();

router.post("/", requireAuth, requireCron, async (req: any, res: any) => {
  try {
    const { name, team, position } = req.body;
    if (!name || !team || !position) {
      res.status(400).json({ error: "name, team, and position are required" });
      return;
    }
    const [player] = await db.insert(players).values({ name, team, position }).returning();
    res.status(201).json(player);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/", requireAuth, async (req: any, res: any) => {
  try {
    const rows = await db.select().from(players).orderBy(asc(players.name));
    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Lazy image + jersey resolution: espnId in DB → ESPN search by name → store for next time
router.get("/:id/image", requireAuth, async (req: any, res: any) => {
  try {
    const [player] = await db.select().from(players).where(eq(players.id, req.params.id)).limit(1);
    if (!player) { res.status(404).json({ error: "Not found" }); return; }

    let espnId = player.espnId;
    if (!espnId) espnId = await searchEspnPlayerId(player.name);

    if (!espnId) { res.json({ imageUrl: null, jersey: null }); return; }

    // "FLEX" means the odds feed gave no position — usually a player who only
    // shows up in the anytime-touchdown market. Backfill it off the same lookup
    // the jersey needs, so it self-heals the first time the avatar renders.
    let jersey = player.jersey;
    let position = player.position;
    if (!jersey || position === "FLEX") {
      const details = await getAthleteDetails(espnId);
      jersey = jersey ?? details.jersey;
      if (position === "FLEX" && details.position) position = details.position;
    }

    if (espnId !== player.espnId || jersey !== player.jersey || position !== player.position) {
      await db.update(players)
        .set({ espnId, imageUrl: espnImageUrl(espnId), jersey, position })
        .where(eq(players.id, player.id));
    }
    res.json({ imageUrl: espnImageUrl(espnId), jersey, position });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
