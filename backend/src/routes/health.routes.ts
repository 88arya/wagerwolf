import { Router } from "express";
import { dbPool } from "../db/db";
import { isLoadTestRequest } from "../middleware/rateLimit";

const router = Router();

// Boot time, captured once at module load. Reported as uptime so a deploy can
// be told apart from a container that has been quietly restarting: a health
// check that answers 200 with an uptime of 4 seconds on every poll is a crash
// loop, and a plain {status:"ok"} cannot show you that.
const STARTED_AT = Date.now();

/**
 * Liveness probe. Mounted in index.ts BEFORE the rate limiter so platform
 * health checks — which poll hard — can never be throttled into failing a
 * deploy.
 *
 * Deliberately touches nothing. It does not query Postgres or ping Redis, so
 * it answers "this process is up and serving" and nothing more. Railway
 * restarts the container when this fails, and a transient database blip is not
 * a reason to restart a healthy process — the app already fails fast at boot on
 * a missing DATABASE_URL/REDIS_URL, which is where that check belongs.
 */
router.get("/", (req, res) => {
  // Connection-pool saturation, for a load test and nothing else. Gated behind
  // the same key as the rate-limit bypass: pool internals are nobody else's
  // business, and an unauthenticated caller learns nothing useful from them.
  //
  // `waiting` IS THE MEASUREMENT. total/idle describe the pool at rest; a
  // non-zero waiting count is requests queued for a connection, which is the
  // difference between "the database is the bottleneck" and "something else
  // is". Without it a throughput plateau has to be attributed by guesswork.
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
    // Set per-environment by the deploy so you can confirm which commit is
    // actually serving. Undefined locally, which is correct — there isn't one.
    commit: process.env.GIT_COMMIT_SHA ?? null,
    uptimeSeconds: Math.floor((Date.now() - STARTED_AT) / 1000),
    ...(pool ? { pool } : {}),
  });
});

export default router;
