import { Router } from "express";
import { prisma } from "../db/prisma";
import { requireAuth, requireAdmin } from "../middleware/auth";

const router = Router();

const NFL_TEAM_ABBRS = [
  "ARI","ATL","BAL","BUF","CAR","CHI","CIN","CLE",
  "DAL","DEN","DET","GB","HOU","IND","JAX","KC",
  "LAC","LAR","LV","MIA","MIN","NE","NO","NYG",
  "NYJ","PHI","PIT","SF","SEA","TB","TEN","WSH",
];

async function buildEspnNameMap(): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  for (const abbr of NFL_TEAM_ABBRS) {
    try {
      const res = await fetch(
        `https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams/${abbr}/roster`
      );
      if (!res.ok) continue;
      const data = await res.json();
      for (const group of data.athletes ?? []) {
        for (const athlete of group.items ?? []) {
          if (athlete.id && athlete.displayName) {
            map.set(
              (athlete.displayName as string).toLowerCase(),
              `https://a.espncdn.com/i/headshots/nfl/players/full/${athlete.id}.png`
            );
          }
        }
      }
    } catch { /* skip team on error */ }
  }
  return map;
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

// Fetch ESPN headshots for all players missing an image by scanning all 32 team rosters
router.post("/sync-images", requireAuth, requireAdmin, async (req: any, res: any) => {
  try {
    const players = await prisma.player.findMany({ where: { imageUrl: null } });
    if (players.length === 0) { res.json({ synced: 0, total: 0 }); return; }

    const nameMap = await buildEspnNameMap();
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
