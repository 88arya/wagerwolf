import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { homePulse } from "../services/homePulse";
import { homeLeaguesFor } from "../services/homeLeagues";

const router = Router();

router.get("/pulse", requireAuth, async (req, res, next) => {
  try {
    const raw = Number(req.query.limit);
    const limit = Number.isFinite(raw) ? Math.min(Math.max(Math.trunc(raw), 1), 10) : 5;
    res.json(await homePulse(limit));
  } catch (err) {
    next(err);
    return;
  }
});

// Per-user, so not cached.
router.get("/leagues", requireAuth, async (req, res, next) => {
  try {
    res.json(await homeLeaguesFor(req.userId));
  } catch (err) {
    next(err);
    return;
  }
});

export default router;
