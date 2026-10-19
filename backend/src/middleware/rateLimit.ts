import { rateLimit, ipKeyGenerator } from "express-rate-limit";
import { RedisStore } from "rate-limit-redis";
import jwt from "jsonwebtoken";
import { timingSafeEqual } from "crypto";
import { rateLimitRedis } from "../queue/connection";

function makeStore(prefix: string) {
  return new RedisStore({
    prefix,
    sendCommand: (command: string, ...args: string[]) =>
      rateLimitRedis.call(command, ...args) as any,
  });
}

// Limiters fail open: if Redis is down, requests go through uncounted rather
// than the whole API going down. The outage is logged once by the connection.
const STORE_ERROR_PASSED = "express-rate-limit: error from store, allowing request without rate-limiting.";
const failOpen = {
  passOnStoreError: true,
  logger: {
    error: (err: unknown, message?: string) => {
      if (message !== STORE_ERROR_PASSED) console.error(message ?? "", err);
    },
    warn: (err: unknown, message?: string) => console.warn(message ?? "", err),
  },
};

// By user when signed in (so shared IPs don't throttle each other), else by IP.
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

// Load-test bypass for globalLimiter only, and only when LOADTEST_KEY is set.
const LOADTEST_HEADER = "x-loadtest-key";
const MIN_KEY_LENGTH = 24;

export function isLoadTestRequest(req: any): boolean {
  const expected = process.env.LOADTEST_KEY;
  if (!expected || expected.length < MIN_KEY_LENGTH) return false;

  const got = req.headers[LOADTEST_HEADER];
  if (typeof got !== "string") return false;

  // Compare byte lengths: timingSafeEqual throws on mismatched buffers.
  const a = Buffer.from(got);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;

  return timingSafeEqual(a, b);
}

export const globalLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 300,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: userOrIpKey,
  skip: isLoadTestRequest,
  store: makeStore("rl:global:"),
  ...failOpen,
});

// Unauthenticated, so per IP.
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => ipKeyGenerator(req.ip ?? ""),
  store: makeStore("rl:auth:"),
  ...failOpen,
});

// Unauthenticated form, so per IP.
export const supportLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => ipKeyGenerator(req.ip ?? ""),
  store: makeStore("rl:support:"),
  ...failOpen,
});

export const betLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `user:${req.userId}`,
  store: makeStore("rl:bet:"),
  ...failOpen,
});
