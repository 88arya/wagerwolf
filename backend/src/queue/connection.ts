import IORedis from "ioredis";
import { reportCondition } from "../lib/monitoring";

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";

/**
 * Logs a connection's outage once, and its recovery once.
 *
 * ioredis emits `error` on every reconnect attempt, several a second for as long
 * as Redis is down, and with no listener it prints each one as an "Unhandled
 * error event". An outage used to bury the logs; now it is one line going down,
 * one coming back, and one Sentry warning.
 */
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

/**
 * The rate limiters' own connection, and the reason it is not the one above.
 *
 * BullMQ requires `maxRetriesPerRequest: null`, which makes a command wait
 * FOREVER while Redis is down. The limiters shared that connection, so a Redis
 * outage hung every request that passed a limiter, which is every route except
 * /health: measured, no response after 10s, while /health answered 200 in 5ms and
 * the container's healthcheck stayed green. The API was down and nothing said so.
 *
 * Here a command gives up instead: after one reconnect attempt, or after 1s
 * however it is stuck. The offline queue stays ON, so commands issued during boot
 * wait for the first connect rather than failing; turning it off made every boot
 * log four spurious store-init errors. Measured: up, PING in 10ms from a cold
 * start; down, rejected in 214ms, or 1013ms once reconnecting.
 *
 * A rejection reaches the limiters, which let the request through (see
 * `passOnStoreError` in middleware/rateLimit.ts).
 */
export const rateLimitRedis = new IORedis(REDIS_URL, {
  maxRetriesPerRequest: 1,
  commandTimeout: 1000,
  connectTimeout: 2000,
  retryStrategy: (attempt) => Math.min(attempt * 200, 2000),
});
watchOutage(rateLimitRedis, "rate-limit");
