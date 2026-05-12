import { Router } from "express";
import { prisma } from "../db/prisma";
import { requireAuth, requireAdmin } from "../middleware/auth";
import { buildEspnRosterMap } from "../services/espnApi";

const router = Router();

router.post("/", requireAuth, requireAdmin, async (req: any, res: any) => {
  try {
    const { name, team, position } = req.body;
    if (!name || !team || !position) {
      res.status(400).json({ error: "name, team, and position are required" });
      return;
    }
    const player = await prisma.player.create({ data: { name, team, position } });
    res.status(201).json(player);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/", requireAuth, async (req: any, res: any) => {
  try {
    const players = await prisma.player.findMany({ orderBy: { name: "asc" } });
    res.json(players);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Fetch ESPN headshots for all players missing an image by scanning all 32 team rosters
router.post("/sync-images", requireAuth, requireAdmin, async (req: any, res: any) => {
  try {
    const players = await prisma.player.findMany({ where: { imageUrl: null } });
    if (players.length === 0) { res.json({ synced: 0, total: 0 }); return; }

    const nameMap = await buildEspnRosterMap();
    let synced = 0;
    for (const player of players) {
      const imageUrl = nameMap.get(player.name.toLowerCase());
      if (imageUrl) {
        await prisma.player.update({ where: { id: player.id }, data: { imageUrl } });
        synced++;
      }
    }
    res.json({ synced, total: players.length });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
