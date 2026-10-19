import type { NextFunction, Request, Response } from "express";
import { dbPool } from "../db/db";

// Return 503 when too many requests are waiting for a DB connection, rather
// than queueing until the box runs out of memory.
const SHED_AT = Number(process.env.SHED_POOL_WAITING) || 50;

let shedThisMinute = 0;
setInterval(() => {
  if (shedThisMinute > 0) console.warn(`[shed] ${shedThisMinute} requests answered 503 in the last minute (pool waiting >= ${SHED_AT})`);
  shedThisMinute = 0;
}, 60_000).unref();

export function loadShed<P>(_req: Request<P>, res: Response, next: NextFunction): void {
  if (dbPool.waitingCount >= SHED_AT) {
    shedThisMinute++;
    res.setHeader("Retry-After", "2");
    res.status(503).json({ error: "Wagerwolf is busy. Try again in a moment." });
    return;
  }
  next();
}
