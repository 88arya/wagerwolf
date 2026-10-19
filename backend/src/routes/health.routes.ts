import { Router } from "express";
import { dbPool } from "../db/db";
import { isLoadTestRequest } from "../middleware/rateLimit";

const router = Router();

const STARTED_AT = Date.now();

// Liveness only: no DB or Redis calls. Mounted before the rate limiter.
router.get("/", (req, res) => {
  // Pool stats, only for load tests. `waiting` > 0 means requests are queued on the DB.
  const pool = isLoadTestRequest(req)
    ? {
        total: dbPool.totalCount,
        idle: dbPool.idleCount,
        waiting: dbPool.waitingCount,
        max: (dbPool as any).options?.max ?? null,
      }
    : undefined;

  res.json({
    status: "ok",
    commit: process.env.GIT_COMMIT_SHA ?? null,
    uptimeSeconds: Math.floor((Date.now() - STARTED_AT) / 1000),
    ...(pool ? { pool } : {}),
  });
});

export default router;
