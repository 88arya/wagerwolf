/**
 * A Redis outage must degrade the API, not take it down.
 *
 * The backend reaches Redis through a TCP proxy this test controls, so Redis can
 * be "taken down" and "brought back" mid-run without touching the real one.
 * Before the fix, every route behind a rate limiter hung with no response while
 * /health went on answering 200.
 *
 * Same requirements as monitoring.e2e.test.ts: the build, and Redis on 6379.
 * Uses logical database 14 so it can run beside that file.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import net from "node:net";
import IORedis from "ioredis";
import { backendEnv, kill, spawnNode, startSink, waitFor } from "./helpers";

const REDIS_DB = 14;
const DEAD_DB = "postgres://nobody:nobody@127.0.0.1:1/none";

/** A proxy to the real Redis that can refuse connections on demand. */
function redisProxy() {
  const sockets = new Set<net.Socket>();
  let server: net.Server | undefined;
  let port = 0;

  const up = () =>
    new Promise<void>((resolve) => {
      server = net.createServer((client) => {
        const upstream = net.connect(6379, "127.0.0.1");
        for (const s of [client, upstream]) {
          sockets.add(s);
          s.on("close", () => sockets.delete(s));
          s.on("error", () => s.destroy());
        }
        client.pipe(upstream).pipe(client);
      });
      server.listen(port, "127.0.0.1", () => {
        port = (server!.address() as net.AddressInfo).port;
        resolve();
      });
    });

  const down = () =>
    new Promise<void>((resolve) => {
      for (const s of sockets) s.destroy();
      sockets.clear();
      if (!server) return resolve();
      server.close(() => resolve());
    });

  return { up, down, url: () => `redis://127.0.0.1:${port}/${REDIS_DB}` };
}

async function timed(url: string) {
  const started = Date.now();
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  return { res, ms: Date.now() - started };
}

let sink: Awaited<ReturnType<typeof startSink>>;
let proxy: ReturnType<typeof redisProxy>;
let server: ReturnType<typeof spawnNode>;
let base: string;

beforeAll(async () => {
  const check = new IORedis(`redis://127.0.0.1:6379/${REDIS_DB}`, { maxRetriesPerRequest: 1, lazyConnect: true });
  try {
    await check.connect();
    await check.flushdb();
  } catch {
    throw new Error("e2e needs Redis on 127.0.0.1:6379 — `docker start fanmark-redis`");
  } finally {
    check.disconnect();
  }

  sink = await startSink();
  proxy = redisProxy();
  await proxy.up();

  const port = await new Promise<number>((resolve) => {
    const s = net.createServer().listen(0, "127.0.0.1", () => {
      const p = (s.address() as net.AddressInfo).port;
      s.close(() => resolve(p));
    });
  });
  base = `http://127.0.0.1:${port}`;
  server = spawnNode(
    ["dist/index.js"],
    backendEnv({
      NODE_ENV: "production",
      PORT: String(port),
      DATABASE_URL: DEAD_DB,
      REDIS_URL: proxy.url(),
      JWT_SECRET: "e2e-not-a-secret",
      SENTRY_DSN: sink.dsn,
    })
  );
  await waitFor(() => server.output().includes("Server running"), "the server to listen", 30_000);
}, 45_000);

afterAll(async () => {
  if (server) kill(server.child);
  await proxy?.down();
  await sink?.close();
  const clean = new IORedis(`redis://127.0.0.1:6379/${REDIS_DB}`, { maxRetriesPerRequest: 1 });
  await clean.flushdb().catch(() => {});
  clean.disconnect();
});

describe("with Redis up", () => {
  it("requests are counted", async () => {
    const { res } = await timed(`${base}/no/such/route`);
    expect(res.status).toBe(404);
    expect(res.headers.get("ratelimit-limit")).toBe("300");
  });

  it("the global limit is still enforced", async () => {
    let limited = 0;
    for (let i = 0; i < 305 && !limited; i++) {
      const res = await fetch(`${base}/no/such/route`);
      if (res.status === 429) limited = i;
    }
    expect(limited).toBeGreaterThan(0);
  }, 30_000);
});

describe("with Redis down", () => {
  beforeAll(async () => {
    await proxy.down();
  });

  it("/health still answers", async () => {
    const { res } = await timed(`${base}/health`);
    expect(res.status).toBe(200);
  });

  it("routes answer promptly, uncounted, instead of hanging", async () => {
    // The first request can pay for one reconnect attempt; later ones fail fast.
    for (let i = 0; i < 3; i++) {
      const { res, ms } = await timed(`${base}/no/such/route`);
      expect(res.status).toBe(404);
      expect(res.headers.get("ratelimit-limit")).toBeNull();
      expect(ms).toBeLessThan(3000);
    }
  });

  it("the outage is reported once per connection, not once per request", async () => {
    for (let i = 0; i < 5; i++) await timed(`${base}/no/such/route`);
    const lost = await waitFor(() => {
      const e = sink.events.filter((e) => e.message?.includes("[redis] rate-limit connection lost"));
      return e.length ? e : undefined;
    }, "the outage report");
    expect(lost).toHaveLength(1);
    expect(lost[0].level).toBe("warning");
    expect(lost[0].fingerprint).toEqual(["redis-down", "rate-limit"]);
    // ...and the per-request library line is not flooding the log.
    expect(server.output()).not.toContain("allowing request without rate-limiting");
  });
});

describe("when Redis comes back", () => {
  beforeAll(async () => {
    await proxy.up();
  });

  it("counting resumes on its own", async () => {
    const counted = await waitFor(async () => {
      const { res } = await timed(`${base}/no/such/route`);
      return res.headers.get("ratelimit-limit") === "300" || undefined;
    }, "rate limiting to resume", 15_000);
    expect(counted).toBe(true);
    expect(server.output()).toContain("[redis] rate-limit connection restored");
  }, 20_000);
});
