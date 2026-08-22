import { Router } from "express";
import { requireAuth, requireCron } from "../middleware/auth";
import { syncOdds, syncOddsAllWeeks } from "../services/syncWeek";

const router = Router();

router.post("/all", requireAuth, requireCron, async (_req: any, res: any) => {
  try {
    const result = await syncOddsAllWeeks();
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/week/:weekId", requireAuth, requireCron, async (req: any, res: any) => {
  try {
    const result = await syncOdds(req.params.weekId);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
