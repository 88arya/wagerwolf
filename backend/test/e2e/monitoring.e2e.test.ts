/**
 * End to end: the BUILT backend (dist/, as the container runs it) booted as a
 * child process, with Sentry and healthchecks.io replaced by a local sink.
 *
 * The database is deliberately unreachable. That is the failure worth rehearsing
 * — Supabase is across the internet from the box — and it makes every route and
 * every job that touches Postgres fail without needing a fixture. Nothing here
 * can spend SportsGameOdds quota, send mail or touch a real database.
 *
 * NEEDS REDIS on 127.0.0.1:6379 (the dev `fanmark-redis` container). It uses
 * logical database 15, which it empties before and after, so dev data in
 * database 0 is never touched.
 *
 *   npm run test:e2e
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import net from "node:net";
import IORedis from "ioredis";
import { Queue } from "bullmq";
import {
  BAD_KEY,
  backendEnv,
  kill,
  spawnNode,
  startSink,
  waitFor,
  type SentryEvent,
} from "./helpers";

const REDIS_DB = 15;
const REDIS_URL = `redis://127.0.0.1:6379/${REDIS_DB}`;
const DEAD_DB = "postgres://nobody:nobody@127.0.0.1:1/none";
const PING_KEY = "e2e-key";

let sink: Awaited<ReturnType<typeof startSink>>;
let server: ReturnType<typeof spawnNode>;
let base: string;
let redis: IORedis;
let queue: Queue;

async function freePort(): Promise<number> {
  return new Promise((resolve) => {
    const s = net.createServer();
    s.listen(0, "127.0.0.1", () => {
      const { port } = s.address() as net.AddressInfo;
      s.close(() => resolve(port));
    });
  });
}

const eventText = (e: SentryEvent) => [e.message, ...(e.exception?.values ?? []).map((v) => v.value)].join(" ");

beforeAll(async () => {
  redis = new IORedis(REDIS_URL, { maxRetriesPerRequest: 1, lazyConnect: true });
  try {
    await redis.connect();
    await redis.ping();
  } catch {
    throw new Error("e2e needs Redis on 127.0.0.1:6379 — `docker start fanmark-redis`");
  }
  await redis.flushdb();

  sink = await startSink();
  const port = await freePort();
  base = `http://127.0.0.1:${port}`;

  server = spawnNode(
    ["dist/index.js"],
    backendEnv({
      NODE_ENV: "production",
      PORT: String(port),
      DATABASE_URL: DEAD_DB,
      REDIS_URL,
      JWT_SECRET: "e2e-not-a-secret",
      CRON_SECRET: "e2e-cron",
      SENTRY_DSN: sink.dsn,
      GIT_COMMIT_SHA: "e2e1234",
      HEALTHCHECKS_PING_KEY: PING_KEY,
      HEALTHCHECKS_PING_URL: sink.pingUrl,
    })
  );
  // The startup seed retries a refused connection twice, 3s apart, before
  // giving up, and the scheduler starts after it.
  await waitFor(() => server.output().includes("worker started"), "the scheduler to start", 45_000);

  queue = new Queue("cron-jobs", { connection: new IORedis(REDIS_URL, { maxRetriesPerRequest: null }) });
}, 60_000);

afterAll(async () => {
  if (server) kill(server.child);
  await queue?.close();
  if (redis?.status === "ready") {
    await redis.flushdb();
    redis.disconnect();
  }
  await sink?.close();
});

describe("boot with the database down", () => {
  it("still serves /health", async () => {
    const res = await fetch(`${base}/health`);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ status: "ok", commit: "e2e1234" });
  });

  it("reports the startup seed failing instead of swallowing it", async () => {
    const e = await waitFor(() => sink.events.find((e) => e.tags?.job === "startup-seed"), "startup-seed event");
    expect(e.level).toBe("error");
    expect(e.release).toBe("e2e1234");
  });
});

describe("API responses", () => {
  it("a route that needs the database answers 500 with an id, reported under that id", async () => {
    const res = await fetch(`${base}/weeks/public/current`, {
      headers: { authorization: "Bearer e2e-token", "x-loadtest-key": "e2e-loadtest", cookie: "a=b" },
    });
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.errorId).toMatch(/^[0-9a-f]{8}$/);
    // Production hides the driver message from the caller.
    expect(body.detail).toBeUndefined();
    expect(JSON.stringify(body)).not.toMatch(/select|params|ECONNREFUSED/i);

    const e = await waitFor(
      () => sink.events.find((e) => e.tags?.errorId === body.errorId),
      `event tagged ${body.errorId}`
    );
    const headers = Object.keys(e.request?.headers ?? {}).map((h) => h.toLowerCase());
    expect(headers).not.toContain("authorization");
    expect(headers).not.toContain("x-loadtest-key");
    expect(headers).not.toContain("cookie");
    expect(e.user?.ip_address).toBeUndefined();
    // The SQL survives to make the error readable; bound values do not.
    const text = eventText(e);
    expect(text).toContain("Failed query");
    expect(text).toContain("params: [scrubbed]");
  });

  it.each([
    ["malformed JSON", "{not json", "application/json", 400],
    ["an oversized body", JSON.stringify({ message: "x".repeat(200_000) }), "application/json", 413],
    ["an unknown charset", "{}", "application/json; charset=klingon", 415],
  ])("%s is a %i and is not reported", async (_what, body, contentType, status) => {
    const before = sink.events.length;
    const res = await fetch(`${base}/support`, { method: "POST", headers: { "content-type": contentType }, body });
    expect(res.status).toBe(status);
    const json = await res.json();
    expect(json.errorId).toBeUndefined();
    // Give a wrongly-sent event time to arrive before asserting it did not.
    await new Promise((r) => setTimeout(r, 750));
    expect(sink.events.slice(before).filter((e) => e.tags?.errorId)).toEqual([]);
  });

  it("an unknown path is a 404 and is not reported", async () => {
    const before = sink.events.length;
    const res = await fetch(`${base}/no/such/route`);
    expect(res.status).toBe(404);
    await new Promise((r) => setTimeout(r, 500));
    expect(sink.events.slice(before).filter((e) => e.tags?.errorId)).toEqual([]);
  });

  it("the cron override routes stay closed without the secret", async () => {
    const res = await fetch(`${base}/espn/resolve/1`, { method: "POST" });
    expect([401, 403]).toContain(res.status);
  });
});

describe("scheduler", () => {
  it("a job that throws fails in BullMQ, is reported once, and pings /fail", async () => {
    const before = sink.events.length;
    const job = await queue.add("score-sync", {});

    const ping = await waitFor(
      () => sink.pings.find((p) => p.slug === "score-sync" && !p.ok),
      "a score-sync /fail ping"
    );
    expect(ping.key).toBe(PING_KEY);

    await waitFor(async () => (await job.isFailed()) || undefined, "the job to be marked failed");
    const failed = await queue.getJob(job.id!);
    expect(failed?.failedReason).toBe("score-sync: 1 step(s) failed: job");

    const events = await waitFor(() => {
      const ev = sink.events.slice(before).filter((e) => e.tags?.job === "score-sync");
      return ev.length ? ev : undefined;
    }, "a score-sync event");
    expect(events[0].tags).toMatchObject({ job: "score-sync", step: "job" });
    // The StepsFailed summary is logged, not sent a second time. A scheduled
    // firing in the same window could add its own event, so count this job's
    // summary rather than all events.
    expect(events.some((e) => eventText(e).includes("step(s) failed"))).toBe(false);
  });

  it("every failing pass of the resolve job is reported, and the job lists all of them", async () => {
    const job = await queue.add("resolve-and-allowances", {});
    await waitFor(async () => (await job.isFailed()) || undefined, "the resolve job to fail");
    const failed = await queue.getJob(job.id!);
    expect(failed?.failedReason).toBe(
      "resolve-and-allowances: 3 step(s) failed: resolvePastWeeks; catchUpAllowances; warnOnStuckWeeks"
    );
    const steps = await waitFor(() => {
      const s = sink.events
        .filter((e) => e.tags?.job === "resolve-and-allowances")
        .map((e) => e.tags!.step);
      return s.length >= 3 ? s : undefined;
    }, "three resolve events");
    expect(new Set(steps)).toEqual(new Set(["resolvePastWeeks", "catchUpAllowances", "warnOnStuckWeeks"]));
    expect(sink.pings.some((p) => p.slug === "resolve-and-allowances" && !p.ok)).toBe(true);
  });

  it("finished jobs are trimmed instead of kept forever", async () => {
    // A job with no handler completes immediately, which makes it the cheapest
    // way to finish 250 jobs.
    await queue.addBulk(Array.from({ length: 250 }, () => ({ name: "e2e-no-handler", data: {} })));
    await waitFor(async () => ((await queue.getWaitingCount()) === 0 ? true : undefined), "the queue to drain", 30_000);
    await new Promise((r) => setTimeout(r, 500));
    expect(await queue.getCompletedCount()).toBeLessThanOrEqual(200);
    expect(sink.pings.some((p) => p.slug === "e2e-no-handler")).toBe(false);
  }, 40_000);
});

describe("the process's last words", () => {
  const crash = (code: string, env: Record<string, string>) =>
    spawnNode(["-e", `require("./dist/instrument"); ${code}`], backendEnv(env));

  it.each([
    ["unhandledRejection", `Promise.reject(new Error("e2e rejection"))`, "e2e rejection"],
    ["uncaughtException", `setTimeout(() => { throw new Error("e2e throw"); }, 10)`, "e2e throw"],
  ])("%s is reported as fatal and exits 1", async (kind, code, msg) => {
    const p = crash(`${code}; setTimeout(() => console.log("STILL ALIVE"), 5000);`, { SENTRY_DSN: sink.dsn });
    expect(await p.exited).toBe(1);
    expect(p.output()).not.toContain("STILL ALIVE");
    const e = await waitFor(() => sink.events.find((e) => eventText(e).includes(msg)), `the ${kind} event`);
    expect(e.level).toBe("fatal");
    expect(e.tags?.mechanism).toBe(kind);
  }, 15_000);

  it("exits 1 without Sentry configured, as Node would", async () => {
    const p = crash(`Promise.reject(new Error("no dsn"))`, {});
    expect(await p.exited).toBe(1);
    expect(p.output()).toContain("[fatal] unhandledRejection");
  });

  it("still exits, promptly, when Sentry is unreachable", async () => {
    const port = await freePort(); // nothing listens here
    const started = Date.now();
    const p = crash(`Promise.reject(new Error("sentry down"))`, { SENTRY_DSN: `http://k@127.0.0.1:${port}/1` });
    expect(await p.exited).toBe(1);
    expect(Date.now() - started).toBeLessThan(8000);
  }, 15_000);

  it("a malformed DSN does not stop the process booting", async () => {
    const p = spawnNode(
      ["-e", `require("./dist/instrument"); console.log("BOOTED")`],
      backendEnv({ SENTRY_DSN: "not a dsn" })
    );
    expect(await p.exited).toBe(0);
    expect(p.output()).toContain("BOOTED");
  });
});

describe("heartbeat against a rejecting healthchecks", () => {
  it("a wrong key is logged, and the job itself is unaffected", async () => {
    const p = spawnNode(
      [
        "-e",
        `require("./dist/lib/heartbeat").heartbeat("score-sync", true).then(() => console.log("RETURNED"))`,
      ],
      backendEnv({ HEALTHCHECKS_PING_KEY: BAD_KEY, HEALTHCHECKS_PING_URL: sink.pingUrl })
    );
    expect(await p.exited).toBe(0);
    expect(p.output()).toContain("answered 404; check HEALTHCHECKS_PING_KEY");
    expect(p.output()).toContain("RETURNED");
  });
});
