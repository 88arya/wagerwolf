import IORedis from "ioredis";
import { reportCondition } from "../lib/monitoring";

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";

// Log an outage once and its recovery once, instead of every reconnect attempt.
function watchOutage(conn: IORedis, name: string) {
  let down = false;
  conn.on("error", (err) => {
    if (down) return;
    down = true;
    reportCondition(`[redis] ${name} connection lost: ${err.message}`, ["redis-down", name], { redis: name });
  });
  conn.on("ready", () => {
    if (!down) return;
    down = false;
    console.log(`[redis] ${name} connection restored`);
  });
}

// BullMQ requires this to be null so it can manage blocking commands itself
export const redisConnection = new IORedis(REDIS_URL, {
  maxRetriesPerRequest: null,
});
watchOutage(redisConnection, "queue");

// Separate connection for the rate limiters. BullMQ's needs
// maxRetriesPerRequest: null, which would hang requests while Redis is down.
export const rateLimitRedis = new IORedis(REDIS_URL, {
  maxRetriesPerRequest: 1,
  commandTimeout: 1000,
  connectTimeout: 2000,
  retryStrategy: (attempt) => Math.min(attempt * 200, 2000),
});
watchOutage(rateLimitRedis, "rate-limit");
