import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";

export function requireAuth<P>(req: Request<P>, res: Response, next: NextFunction) {
  const token = req.headers.authorization?.replace("Bearer ", "");
  if (!token) { res.status(401).json({ error: "Not authenticated" }); return; }
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET!) as { userId: string };
    req.userId = payload.userId;
    next();
  } catch {
    res.status(401).json({ error: "Invalid token" });
  }
}

// Sets req.userId if a valid token is present; never rejects. Not for private data.
export function optionalAuth<P>(req: Request<P>, _res: Response, next: NextFunction) {
  const token = req.headers.authorization?.replace("Bearer ", "");
  if (token) {
    try {
      const payload = jwt.verify(token, process.env.JWT_SECRET!) as { userId: string };
      req.userId = payload.userId;
    } catch {
      // A bad token is treated as no token.
    }
  }
  next();
}

// Open in dev; in production requires x-cron-secret and returns 503 if unset.
export function requireCron<P>(req: Request<P>, res: Response, next: NextFunction) {
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
