import { Router } from "express";
import { requireAuth, requireCron } from "../middleware/auth";
import { syncESPNGames, syncScores } from "../services/syncWeek";
import { resolveWeekById } from "../services/resolveWeek";
import { settlePendingBetsOnFinalGames } from "../services/settleGame";

const router = Router();

router.post("/games/:weekId", requireAuth, requireCron, async (req: any, res: any) => {
  try {
    const result = await syncESPNGames(req.params.weekId);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/scores/:weekId", requireAuth, requireCron, async (req: any, res: any) => {
  try {
    const result = await syncScores(req.params.weekId);
    await settlePendingBetsOnFinalGames(req.params.weekId);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/resolve/:weekId", requireAuth, requireCron, async (req: any, res: any) => {
  try {
    const result = await resolveWeekById(req.params.weekId);
    res.json({ message: "Week auto-resolved", ...result });
  } catch (err: any) {
    const status = err.message === "Week not found" ? 404 : err.message === "Week already resolved" ? 400 : 500;
    res.status(status).json({ error: err.message });
  }
});

export default router;
