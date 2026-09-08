import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { homePulse } from "../services/homePulse";
import { homeLeaguesFor } from "../services/homeLeagues";

const router = Router();

/**
 * GET /home/pulse — the two panels on the signed-in home page.
 *
 * `current` is this week's volume (most bet player / team / game), `last` is
 * last week's money (which backed team came through or fell short, which player
 * made and lost the most). Either can be null: `current` when no unresolved
 * week exists, `last` until the first Tuesday resolve — so the panel is empty
 * for the whole of week 1 by construction, not by accident.
 *
 * Behind requireAuth because it is the dashboard's data, though nothing in it
 * is private: it names players, teams and games, never a user. If a signed-out
 * version of this panel is ever wanted for the landing page, the service is
 * already platform-wide and the guard is the only thing to drop.
 *
 * All money is integer cents, like every other amount the API returns.
 *
 * See services/homePulse.ts for what counts as one bet and how a parlay's money
 * is attributed — both are decisions rather than mechanics.
 */
router.get("/pulse", requireAuth, async (req: any, res: any, next: any) => {
  try {
    const raw = Number(req.query.limit);
    const limit = Number.isFinite(raw) ? Math.min(Math.max(Math.trunc(raw), 1), 10) : 5;
    res.json(await homePulse(limit));
  } catch (err: any) {
    next(err);
    return;
  }
});

/**
 * GET /home/leagues — the Power rankings card's rows, for the caller only.
 *
 * Per-user and therefore NOT cached: /home/pulse is the same six numbers for
 * everybody and caches happily, this is one person's standings and a shared
 * cache would be a cross-user leak rather than an optimisation. It is three
 * indexed queries plus a count, run once per visit to /home.
 *
 * Leagues still in their lobby are omitted — see services/homeLeagues.ts.
 */
router.get("/leagues", requireAuth, async (req: any, res: any, next: any) => {
  try {
    res.json(await homeLeaguesFor(req.userId));
  } catch (err: any) {
    next(err);
    return;
  }
});

export default router;
