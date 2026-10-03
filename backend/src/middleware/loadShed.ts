import { dbPool } from "../db/db";

/**
 * Refuse new work while the database pool is already backed up.
 *
 * WHY. On 3 Oct 2026 a load test pushed production past what one t3.small can
 * serve, and it did not slow down, it fell over. Requests queued for one of the
 * pool's 10 connections (1,053 waiting at the end), each queued request held
 * its socket and its share of memory, Caddy buffered the stalled responses
 * until the kernel OOM-killed it, and the site was down for about two minutes.
 * The app got within 100 MB of its own limit doing the same.
 *
 * A fast 503 is the better failure: the client hears "busy" in milliseconds
 * and retries, and the requests already in flight finish instead of dragging
 * everything else down with them.
 *
 * THE SIGNAL is `waitingCount`, requests waiting for a connection. In normal
 * running it is 0; every route needs the pool, and CPU saturation shows up here
 * too, because a connection is held until its callback gets a turn on the
 * event loop. 50 waiting is several hundred milliseconds of queue on its own.
 * Override with SHED_POOL_WAITING.
 *
 * Mounted after /health, so the load balancer and uptime checks still see a
 * live process, and before the rate limiter, so a shed request costs no Redis
 * round trip. The scheduler does not pass through HTTP and is never shed.
 */
const SHED_AT = Number(process.env.SHED_POOL_WAITING) || 50;

let shedThisMinute = 0;
setInterval(() => {
  if (shedThisMinute > 0) console.warn(`[shed] ${shedThisMinute} requests answered 503 in the last minute (pool waiting >= ${SHED_AT})`);
  shedThisMinute = 0;
}, 60_000).unref();

export function loadShed(_req: any, res: any, next: any): void {
  if (dbPool.waitingCount >= SHED_AT) {
    shedThisMinute++;
    res.setHeader("Retry-After", "2");
    res.status(503).json({ error: "Wagerwolf is busy. Try again in a moment." });
    return;
  }
  next();
}
