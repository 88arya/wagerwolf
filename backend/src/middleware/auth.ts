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

export function requireCron(req: any, res: any, next: NextFunction) {
  const secret = process.env.CRON_SECRET;
  if (!secret) { next(); return; }
  if (req.headers["x-cron-secret"] !== secret) {
    res.status(403).json({ error: "Forbidden" }); return;
  }
  next();
}
