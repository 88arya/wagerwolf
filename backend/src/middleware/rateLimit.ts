import { rateLimit, ipKeyGenerator } from "express-rate-limit";
import { RedisStore } from "rate-limit-redis";
import jwt from "jsonwebtoken";
import { timingSafeEqual } from "crypto";
import { redisConnection } from "../queue/connection";

function makeStore(prefix: string) {
  return new RedisStore({
    prefix,
    // ioredis' `call` is typed with a required first argument, so a plain
    // string[] spread does not satisfy it. Destructure to give it the tuple
    // shape it asks for.
    sendCommand: (command: string, ...args: string[]) =>
      redisConnection.call(command, ...args) as any,
  });
}

// Buckets by authenticated user when a valid JWT is present, otherwise by IP.
// Keeps users on a shared IP (office wifi, NAT) from throttling each other,
// while still bounding unauthenticated traffic per-IP.
function userOrIpKey(req: any): string {
  const token = req.headers.authorization?.replace("Bearer ", "");
  if (token) {
    try {
      const payload = jwt.verify(token, process.env.JWT_SECRET!) as any;
      if (payload?.userId) return `user:${payload.userId}`;
    } catch {
      // fall through to IP-based key
    }
  }
  return ipKeyGenerator(req.ip);
}

/**
 * Load-test bypass for the app-wide limiter, and ONLY the app-wide limiter.
 *
 * Measuring real throughput from one host is impossible while globalLimiter caps
 * that host at 300/min: a 20-second run returns 429 for all but the first few
 * hundred requests, and the "req/s" it reports is a rejection rate. Raising the
 * limit for everyone to run a test is the obvious fix and the wrong one — it has
 * to be reverted afterwards, and a revert is exactly the step that gets
 * forgotten.
 *
 * So the bypass is keyed to a header carrying a secret only the test sends, and
 * it is scoped deliberately:
 *
 *   - it is OFF unless LOADTEST_KEY is set, so it does not exist in any
 *     environment that has not opted in
 *   - it skips globalLimiter alone. authLimiter, betLimiter and supportLimiter
 *     are untouched, so a leaked key still cannot hammer Google's token
 *     verification, spam bets, or open the support inbox — it can only remove a
 *     backstop against ordinary reads
 *   - the compare is timing-safe, and a short key is refused outright rather
 *     than quietly accepted
 */
const LOADTEST_HEADER = "x-loadtest-key";
const MIN_KEY_LENGTH = 24;

export function isLoadTestRequest(req: any): boolean {
  const expected = process.env.LOADTEST_KEY;
  if (!expected || expected.length < MIN_KEY_LENGTH) return false;

  const got = req.headers[LOADTEST_HEADER];
  if (typeof got !== "string") return false;

  // Compare BYTE lengths, not string lengths: timingSafeEqual throws on
  // mismatched buffers, and a multi-byte character makes the two disagree. A
  // throw here would be a 500 on every request carrying a malformed header.
  const a = Buffer.from(got);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;

  return timingSafeEqual(a, b);
}

// App-wide backstop: generous enough for normal usage (chat polls every 5s,
// live score polling, etc.) but stops a runaway client/script from hammering
// the API and degrading it for everyone else. Applied first, before routes.
export const globalLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 300,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: userOrIpKey,
  skip: isLoadTestRequest,
  store: makeStore("rl:global:"),
});

// Public auth endpoint has no user yet, so it's IP-keyed. Tight window —
// this is the only unauthenticated route, guards against credential-stuffing
// style hammering and against burning Google's token-verification quota.
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  // `req.ip` is `string | undefined` when Express cannot determine one; an
  // empty key still buckets those together, which is the safe direction.
  keyGenerator: (req) => ipKeyGenerator(req.ip ?? ""),
  store: makeStore("rl:auth:"),
});

/**
 * The support form is UNAUTHENTICATED — it is on the marketing footer and
 * inside /docs, both of which serve signed-out visitors — so without this it is
 * an open pipe from the internet into our own inbox, and into a table anyone
 * can grow without limit.
 *
 * Per IP rather than per user, because most senders have no account. 5/hour is
 * generous for a human with a problem and useless to anything scripted.
 */
export const supportLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => ipKeyGenerator(req.ip ?? ""),
  store: makeStore("rl:support:"),
});

// Bet placement moves fake money and writes to the DB on every call — cap it
// per-user so a stuck retry loop or scripted client can't spam bets/cashouts.
// Always mounted after requireAuth, so req.userId is guaranteed to be set.
export const betLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: any) => `user:${req.userId}`,
  store: makeStore("rl:bet:"),
});
