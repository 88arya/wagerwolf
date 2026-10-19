import { Router } from "express";
import { requireAuth, requireCron } from "../middleware/auth";
import { syncOdds, syncOddsAllWeeks } from "../services/syncWeek";

const router = Router();

router.post("/all", requireAuth, requireCron, async (_req, res, next) => {
  try {
    const result = await syncOddsAllWeeks();
    res.json(result);
  } catch (err) {
    next(err); return;
  }
});

router.post("/week/:weekId", requireAuth, requireCron, async (req, res, next) => {
  try {
    const result = await syncOdds(req.params.weekId);
    res.json(result);
  } catch (err) {
    next(err); return;
  }
});

export default router;
