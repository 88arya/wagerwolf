/**
 * End to end for the Next server's error reporting: builds the real production
 * bundle, runs it as the container does (`.next/standalone/server.js`), makes a
 * server render throw, and checks what reaches a stand-in for Sentry.
 *
 *   npm run test:e2e
 *
 * It needs a route that throws, and there is none, so it writes one for the
 * duration of the run and removes it in a `finally`. The route is gitignored, so
 * a copy left by a killed run cannot be committed, and it only throws while
 * SENTRY_E2E_PROBE=1 is set in the SERVER'S environment; anywhere else it is a
 * 404. It overwrites `.next`, like any build.
 *
 * Browser-side reporting is not covered here: that needs a browser. See
 * test/instrumentation.test.ts for the client init.
 */
import { spawn } from "node:child_process";
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import http from "node:http";
import net from "node:net";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PROBE_DIR = path.join(ROOT, "app", "zz-sentry-probe");
const RELEASE = "e2e-web";

const results = [];
function check(name, ok, detail = "") {
  results.push({ name, ok });
  console.log(`${ok ? "  ok  " : "  FAIL"} ${name}${!ok && detail ? `\n        ${detail}` : ""}`);
}

function freePort() {
  return new Promise((resolve) => {
    const s = net.createServer();
    s.listen(0, "127.0.0.1", () => {
      const { port } = s.address();
      s.close(() => resolve(port));
    });
  });
}

async function startSink() {
  const events = [];
  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      let body = Buffer.concat(chunks);
      if (req.headers["content-encoding"] === "gzip") body = zlib.gunzipSync(body);
      for (const line of body.toString("utf8").split("\n")) {
        try {
          const j = JSON.parse(line);
          if (j && (j.exception || j.message) && j.level) events.push(j);
        } catch {}
      }
      res.end("{}");
    });
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  return { events, port: server.address().port, close: () => new Promise((r) => server.close(r)) };
}

function run(cmd, args, opts) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: "inherit", shell: process.platform === "win32", ...opts });
    p.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} ${args.join(" ")} exited ${code}`))));
  });
}

async function waitFor(fn, timeoutMs = 20000) {
  const started = Date.now();
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() - started > timeoutMs) return undefined;
    await new Promise((r) => setTimeout(r, 150));
  }
}

const sink = await startSink();
let server;

try {
  mkdirSync(PROBE_DIR, { recursive: true });
  writeFileSync(
    path.join(PROBE_DIR, "page.tsx"),
    `import { notFound } from "next/navigation";
export const dynamic = "force-dynamic";
export default function Probe() {
  if (process.env.SENTRY_E2E_PROBE !== "1") notFound();
  throw new Error("frontend e2e probe: server render failed");
}
`
  );

  console.log("building with a DSN pointed at the local sink...");
  await run("npm", ["run", "build"], {
    cwd: ROOT,
    env: {
      ...process.env,
      NEXT_PUBLIC_API_URL: "https://e2e.invalid",
      NEXT_PUBLIC_SENTRY_DSN: `http://publickey@127.0.0.1:${sink.port}/2`,
      NEXT_PUBLIC_GIT_COMMIT_SHA: RELEASE,
    },
  });

  // What frontend/Dockerfile does: tracing leaves static assets out.
  const standalone = path.join(ROOT, ".next", "standalone");
  cpSync(path.join(ROOT, ".next", "static"), path.join(standalone, ".next", "static"), { recursive: true });
  if (existsSync(path.join(ROOT, "public"))) cpSync(path.join(ROOT, "public"), path.join(standalone, "public"), { recursive: true });

  const port = await freePort();
  const base = `http://127.0.0.1:${port}`;
  let log = "";
  server = spawn(process.execPath, ["server.js"], {
    cwd: standalone,
    env: { ...process.env, PORT: String(port), HOSTNAME: "127.0.0.1", NODE_ENV: "production", SENTRY_E2E_PROBE: "1" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  server.stdout.on("data", (d) => (log += d));
  server.stderr.on("data", (d) => (log += d));

  const up = await waitFor(async () => {
    try {
      return (await fetch(`${base}/docs`)).status === 200;
    } catch {
      return false;
    }
  });
  check("the standalone server serves /docs", Boolean(up), log.slice(-500));

  const before = sink.events.length;
  const nf = await fetch(`${base}/definitely-not-a-route`);
  check("an unknown route is a 404", nf.status === 404, `got ${nf.status}`);

  const res = await fetch(`${base}/zz-sentry-probe`, { headers: { cookie: "docs_theme=dark; secret=1" } });
  check("a server render that throws answers 500", res.status === 500, `got ${res.status}`);

  const event = await waitFor(() =>
    sink.events.find((e) => (e.exception?.values ?? []).some((v) => v.value?.includes("frontend e2e probe")))
  );
  check("the render error reaches Sentry", Boolean(event), `events: ${JSON.stringify(sink.events.slice(before))}`);

  if (event) {
    const digest = log.match(/digest: '(\d+)'/)?.[1];
    check("it is tagged with the digest the user sees", Boolean(digest) && event.tags?.digest === digest,
      `log digest ${digest}, tag ${event.tags?.digest}`);
    check("it carries the build's release", event.release === RELEASE, `release ${event.release}`);
    check("the IP is stripped", event.user?.ip_address === undefined, JSON.stringify(event.user));
    const headers = Object.keys(event.request?.headers ?? {}).map((h) => h.toLowerCase());
    check("cookies are stripped", !headers.includes("cookie") && !event.request?.cookies, JSON.stringify(event.request));
  }

  const notFoundReported = sink.events.slice(before).some((e) =>
    (e.exception?.values ?? []).some((v) => /NEXT_NOT_FOUND|NEXT_HTTP_ERROR/.test(v.value ?? ""))
  );
  check("the 404 was not reported as an error", !notFoundReported);
} catch (err) {
  check("the run completed", false, err instanceof Error ? err.message : String(err));
} finally {
  if (server && server.exitCode === null) server.kill();
  rmSync(PROBE_DIR, { recursive: true, force: true });
  // The build generated route types naming the probe, and `tsc` fails on them
  // once it is gone. Regenerating them leaves the tree as a normal build would.
  await run("npx", ["next", "typegen"], { cwd: ROOT, stdio: "ignore" }).catch(() =>
    console.log("  note: `npx next typegen` failed; run it before `tsc`")
  );
  await sink.close();
}

const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
