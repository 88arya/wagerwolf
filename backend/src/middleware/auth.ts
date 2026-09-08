import { NextFunction } from "express";
import jwt from "jsonwebtoken";

export function requireAuth(req: any, res: any, next: NextFunction) {
  const token = req.headers.authorization?.replace("Bearer ", "");
  if (!token) { res.status(401).json({ error: "Not authenticated" }); return; }
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET!) as any;
    req.userId = payload.userId;
    next();
  } catch {
    res.status(401).json({ error: "Invalid token" });
  }
}

/**
 * Fills in req.userId IF a valid token happens to be present, and lets the
 * request through either way.
 *
 * For routes that serve signed-out visitors but can do something better with a
 * session — the support form is the first: anyone may send a message, and one
 * from a signed-in user is tied to their account without their being asked who
 * they are.
 *
 * A BAD TOKEN IS TREATED AS NO TOKEN, not as an error. The route does not need
 * a session, so rejecting an expired one would deny service over a credential
 * that was never required — a visitor with a stale token in localStorage would
 * find the contact form broken and no way to guess why.
 *
 * NEVER use this where a route reads or writes something private. It cannot
 * refuse anyone, so `req.userId` being set is not a permission — it is a hint.
 */
export function optionalAuth(req: any, _res: any, next: NextFunction) {
  const token = req.headers.authorization?.replace("Bearer ", "");
  if (token) {
    try {
      const payload = jwt.verify(token, process.env.JWT_SECRET!) as any;
      req.userId = payload.userId;
    } catch {
      // Ignored on purpose — see above.
    }
  }
  next();
}

/**
 * Guards the emergency-override routes — POST /espn/resolve/:weekId,
 * /espn/games/:weekId, /sync/week/:weekId, /weeks/:id/resolve. These force week
 * resolution and ESPN re-syncs, i.e. they settle everyone's bets.
 *
 * FAIL-OPEN IN DEV, FAIL-CLOSED IN PRODUCTION. An unset CRON_SECRET used to
 * call next() everywhere, which is convenient locally and indefensible in
 * production: it left bet settlement reachable by anyone who could guess a
 * route. Dev keeps the convenience because there is nothing to protect; a
 * deployed environment that forgot the variable gets a 503 instead of an open
 * door, which is a failure you notice rather than one you don't.
 */
export function requireCron(req: any, res: any, next: NextFunction) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      console.error("requireCron: CRON_SECRET is unset — refusing the request.");
      res.status(503).json({ error: "Cron routes are not configured" });
      return;
    }
    next();
    return;
  }
  if (req.headers["x-cron-secret"] !== secret) {
    res.status(403).json({ error: "Forbidden" }); return;
  }
  next();
}
