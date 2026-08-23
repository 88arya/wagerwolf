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
    // Team disambiguates same-name players — see searchEspnPlayerId.
    if (!espnId) espnId = await searchEspnPlayerId(player.name, player.team);

    if (!espnId) { res.json({ imageUrl: null, jersey: null }); return; }

    // ESPN OWNS THE POSITION. What the row arrives with is a guess made from
    // the market it was first seen in (POSITION_HINT in services/syncWeek.ts),
    // and that guess is wrong for anyone who appears outside their own
    // position — a quarterback with a rushing-yards prop is filed as RB if the
    // rushing market happens to come first in the feed's array.
    //
    // This used to overwrite only the literal string "FLEX", so it rescued the
    // players the feed said nothing about and left every confidently-wrong
    // guess in place forever. Nothing else ever revisits the field: the odds
    // sync updates `team` on an existing player and never `position`.
    //
    // The `!jersey` guard is what keeps this to one request per player. The
    // jersey is only ever written here, so an empty one means "never resolved",
    // and once both are filled nothing re-fetches.
    let jersey = player.jersey;
    let position = player.position;
    if (!jersey || position === "FLEX") {
      const details = await getAthleteDetails(espnId);
      jersey = jersey ?? details.jersey;
      if (details.position) position = details.position;
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
