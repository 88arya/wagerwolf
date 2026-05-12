import { Router } from "express";
import { prisma } from "../db/prisma";
import { requireAuth, requireAdmin } from "../middleware/auth";

const router = Router();

async function fetchEspnImageUrl(playerName: string): Promise<string | null> {
  try {
    const encoded = encodeURIComponent(playerName);
    const res = await fetch(
      `https://site.web.api.espn.com/apis/common/v3/sports/football/nfl/athletes?search=${encoded}&limit=5`
    );
    if (!res.ok) return null;
    const data = await res.json();
    const id = data?.items?.[0]?.id;
    if (!id) return null;
    return `https://a.espncdn.com/i/headshots/nfl/players/full/${id}.png`;
  } catch {
    return null;
  }
}

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

// Fetch and cache ESPN headshots for all players missing an image
router.post("/sync-images", requireAuth, requireAdmin, async (req: any, res: any) => {
  try {
    const players = await prisma.player.findMany({ where: { imageUrl: null } });
    let synced = 0;
    for (const player of players) {
      const imageUrl = await fetchEspnImageUrl(player.name);
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
