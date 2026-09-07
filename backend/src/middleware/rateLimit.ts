import { rateLimit, ipKeyGenerator } from "express-rate-limit";
import { RedisStore } from "rate-limit-redis";
import jwt from "jsonwebtoken";
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

// App-wide backstop: generous enough for normal usage (chat polls every 5s,
// live score polling, etc.) but stops a runaway client/script from hammering
// the API and degrading it for everyone else. Applied first, before routes.
export const globalLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 300,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: userOrIpKey,
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
