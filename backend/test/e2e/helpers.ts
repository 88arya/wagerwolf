/**
 * A stand-in for both outside services the monitoring talks to, on one local
 * port: Sentry's envelope endpoint and healthchecks.io's ping endpoint. Tests
 * point SENTRY_DSN and HEALTHCHECKS_PING_URL at it and read back what arrived.
 */
import http from "node:http";
import zlib from "node:zlib";
import type { AddressInfo } from "node:net";
import { spawn, type ChildProcess } from "node:child_process";
import path from "node:path";

export type SentryEvent = {
  level?: string;
  message?: string;
  exception?: { values?: { type?: string; value?: string }[] };
  tags?: Record<string, string>;
  fingerprint?: string[];
  user?: Record<string, unknown>;
  request?: { headers?: Record<string, string>; data?: unknown; url?: string };
  release?: string;
};
export type Ping = { key: string; slug: string; ok: boolean };

/** Healthchecks answers 404 to this key, the way it does to a wrong one. */
export const BAD_KEY = "wrong-key";

export async function startSink() {
  const events: SentryEvent[] = [];
  const pings: Ping[] = [];

  const server = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      const url = new URL(req.url ?? "/", "http://sink");

      const ping = url.pathname.match(/^\/ping\/([^/]+)\/([^/]+)(\/fail)?$/);
      if (ping) {
        const key = decodeURIComponent(ping[1]);
        pings.push({ key, slug: ping[2], ok: !ping[3] });
        res.statusCode = key === BAD_KEY ? 404 : 200;
        return res.end(key === BAD_KEY ? "not found" : "OK");
      }

      if (/^\/api\/\d+\/envelope\/?$/.test(url.pathname)) {
        let body = Buffer.concat(chunks);
        if (req.headers["content-encoding"] === "gzip") body = zlib.gunzipSync(body);
        // An envelope is newline-delimited JSON: a header, then item header and
        // item payload pairs. Events are the payloads with a level.
        for (const line of body.toString("utf8").split("\n")) {
          try {
            const j = JSON.parse(line);
            if (j && (j.exception || j.message) && j.level) events.push(j);
          } catch {
            /* attachments and non-JSON lines */
          }
        }
        return res.end("{}");
      }

      res.statusCode = 404;
      res.end();
    });
  });

  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const port = (server.address() as AddressInfo).port;

  return {
    events,
    pings,
    dsn: `http://publickey@127.0.0.1:${port}/1`,
    pingUrl: `http://127.0.0.1:${port}/ping`,
    close: () => new Promise<void>((r) => server.close(() => r())),
  };
}

export async function waitFor<T>(
  fn: () => T | undefined | false | Promise<T | undefined | false>,
  what: string,
  timeoutMs = 20_000
): Promise<T> {
  const started = Date.now();
  for (;;) {
    // Awaited, or an async predicate's promise would count as truthy at once.
    const v = await fn();
    if (v) return v;
    if (Date.now() - started > timeoutMs) throw new Error(`timed out waiting for ${what}`);
    await new Promise((r) => setTimeout(r, 100));
  }
}

export const BACKEND = path.resolve(__dirname, "../..");

/** Every environment variable a spawned backend sees, starting from nothing. */
export function backendEnv(over: Record<string, string>) {
  // Only what a process needs to run, so a developer's own SENTRY_DSN or
  // HEALTHCHECKS key can never leak into a test. `.env` still loads for
  // anything not set here (dotenv never overrides), so the ones that matter
  // are set explicitly, blank where they must be off.
  const keep = ["PATH", "Path", "SystemRoot", "TEMP", "TMP", "HOME", "USERPROFILE", "APPDATA", "LOCALAPPDATA"];
  const base: Record<string, string> = {};
  for (const k of keep) if (process.env[k]) base[k] = process.env[k]!;
  return {
    ...base,
    SENTRY_DSN: "",
    SENTRY_TRACES_SAMPLE_RATE: "",
    HEALTHCHECKS_PING_KEY: "",
    HEALTHCHECKS_PING_URL: "",
    SPORTSGAMEODDS_KEY: "",
    RESEND_API_KEY: "",
    LOADTEST_KEY: "",
    ...over,
  };
}

export function spawnNode(args: string[], env: Record<string, string>) {
  const child = spawn(process.execPath, args, { cwd: BACKEND, env, stdio: ["ignore", "pipe", "pipe"] });
  let output = "";
  child.stdout!.on("data", (d) => (output += d));
  child.stderr!.on("data", (d) => (output += d));
  const exited = new Promise<number | null>((r) => child.on("exit", (code) => r(code)));
  return { child, exited, output: () => output };
}

export function kill(child: ChildProcess) {
  if (child.exitCode === null && !child.killed) child.kill();
}
