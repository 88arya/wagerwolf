import { Router } from "express";
import { prisma } from "../db/prisma";
import { requireAuth, requireAdmin } from "../middleware/auth";
import { searchEspnPlayerId, espnImageUrl } from "../services/espnApi";

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

// Lazy image resolution: espnId in DB → ESPN search by name → store for next time
router.get("/:id/image", requireAuth, async (req: any, res: any) => {
  try {
    const player = await prisma.player.findUnique({ where: { id: req.params.id } });
    if (!player) { res.status(404).json({ error: "Not found" }); return; }

    if (player.espnId) {
      res.json({ imageUrl: espnImageUrl(player.espnId) });
      return;
    }

    const espnId = await searchEspnPlayerId(player.name);
    if (espnId) {
      await prisma.player.update({ where: { id: player.id }, data: { espnId, imageUrl: espnImageUrl(espnId) } });
      res.json({ imageUrl: espnImageUrl(espnId) });
    } else {
      res.json({ imageUrl: null });
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
