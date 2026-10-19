import { Router } from "express";
import { requireAuth, requireCron } from "../middleware/auth";
import { syncESPNGames, syncScores } from "../services/syncWeek";
import { resolveWeekById } from "../services/resolveWeek";
import { settlePendingBetsOnFinalGames } from "../services/settleGame";

const router = Router();

router.post("/games/:weekId", requireAuth, requireCron, async (req, res, next) => {
  try {
    const result = await syncESPNGames(req.params.weekId);
    res.json(result);
  } catch (err) {
    next(err); return;
  }
});

router.post("/scores/:weekId", requireAuth, requireCron, async (req, res, next) => {
  try {
    const result = await syncScores(req.params.weekId);
    await settlePendingBetsOnFinalGames(req.params.weekId);
    res.json(result);
  } catch (err) {
    next(err); return;
  }
});

router.post("/resolve/:weekId", requireAuth, requireCron, async (req, res, next) => {
  try {
    const result = await resolveWeekById(req.params.weekId);
    res.json({ message: "Week auto-resolved", ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "";
    if (message === "Week not found") { res.status(404).json({ error: message }); return; }
    if (message === "Week already resolved") { res.status(400).json({ error: message }); return; }
    next(err); return;
  }
});

export default router;
