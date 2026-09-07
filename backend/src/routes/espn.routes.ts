import { Router } from "express";
import { requireAuth, requireCron } from "../middleware/auth";
import { syncESPNGames, syncScores } from "../services/syncWeek";
import { resolveWeekById } from "../services/resolveWeek";
import { settlePendingBetsOnFinalGames } from "../services/settleGame";

const router = Router();

router.post("/games/:weekId", requireAuth, requireCron, async (req: any, res: any, next: any) => {
  try {
    const result = await syncESPNGames(req.params.weekId);
    res.json(result);
  } catch (err: any) {
    next(err); return;
  }
});

router.post("/scores/:weekId", requireAuth, requireCron, async (req: any, res: any, next: any) => {
  try {
    const result = await syncScores(req.params.weekId);
    await settlePendingBetsOnFinalGames(req.params.weekId);
    res.json(result);
  } catch (err: any) {
    next(err); return;
  }
});

router.post("/resolve/:weekId", requireAuth, requireCron, async (req: any, res: any, next: any) => {
  try {
    const result = await resolveWeekById(req.params.weekId);
    res.json({ message: "Week auto-resolved", ...result });
  } catch (err: any) {
    // Two known messages are safe to echo back; anything else is an unexpected
    // failure and goes to the error middleware, which logs the real cause and
    // answers with a correlation id rather than the raw message.
    if (err.message === "Week not found") { res.status(404).json({ error: err.message }); return; }
    if (err.message === "Week already resolved") { res.status(400).json({ error: err.message }); return; }
    next(err); return;
  }
});

export default router;
