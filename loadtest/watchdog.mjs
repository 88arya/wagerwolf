/**
 * Safety stop for a k6 run against production.
 *
 * On 3 Oct 2026 an unguarded ramp pushed the box past failure: Caddy was
 * OOM-killed and the site was down for two minutes. This watches the server
 * while a run is going and stops k6 before that can happen again.
 *
 * It streams samples from the box over SSH (container memory and CPU, the DB
 * pool), polls the public /health from outside, and stops k6 through its REST
 * API (k6 must be started with `--address localhost:6565`) when:
 *
 *   - Caddy's memory passes CADDY_MAX_MIB (default 190, of a 256m limit)
 *   - the app's memory passes APP_MAX_MIB (default 560, of a 640m limit)
 *   - /health fails 3 times in a row
 *
 * A REST stop lets k6 write its summary. If k6 is still running 20s later it
 * is killed outright. Every sample is written to WATCH_LOG.
 *
 *   node loadtest/watchdog.mjs
 *
 * Env: SSH_KEY, SSH_HOST (ubuntu@<ip>), WATCH_LOG, HEALTH_URL.
 */
import { spawn, execSync } from "node:child_process";
import { appendFileSync } from "node:fs";

const SSH_KEY = process.env.SSH_KEY;
const SSH_HOST = process.env.SSH_HOST;
const LOG = process.env.WATCH_LOG || "watchdog.log";
const HEALTH = process.env.HEALTH_URL || "https://api.wagerwolf.app/health";
const CADDY_MAX = Number(process.env.CADDY_MAX_MIB || 190);
const APP_MAX = Number(process.env.APP_MAX_MIB || 560);
if (!SSH_KEY || !SSH_HOST) throw new Error("SSH_KEY and SSH_HOST are required");

const log = (line) => { const l = `${new Date().toISOString().slice(11, 19)} ${line}`; console.log(l); appendFileSync(LOG, l + "\n"); };

let stopped = false;
async function stopK6(reason) {
  if (stopped) return;
  stopped = true;
  log(`STOP: ${reason}`);
  try {
    await fetch("http://localhost:6565/v1/status", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ data: { type: "status", id: "default", attributes: { stopped: true } } }),
      signal: AbortSignal.timeout(5000),
    });
    log("k6 asked to stop via REST");
  } catch (e) {
    log(`REST stop failed: ${e.message}`);
  }
  setTimeout(() => {
    try { execSync("taskkill /F /IM k6.exe", { stdio: "ignore" }); log("k6 force-killed"); } catch { /* already gone */ }
    finish();
  }, 20_000);
}

const toMiB = (s) => {
  const m = /([\d.]+)\s*([KMG]i?B)/i.exec(s || "");
  if (!m) return NaN;
  const n = Number(m[1]);
  return m[2].toUpperCase().startsWith("G") ? n * 1024 : m[2].toUpperCase().startsWith("K") ? n / 1024 : n;
};

// One SSH session for the whole run; the remote loop prints one line per sample.
const remote = `while true; do
  s=$(docker stats --no-stream --format '{{.Name}}|{{.CPUPerc}}|{{.MemUsage}}' wagerwolf-app-1 wagerwolf-caddy-1 | tr '\\n' ' ');
  p=$(docker exec wagerwolf-app-1 sh -c 'wget -qO- --header="x-loadtest-key: $LOADTEST_KEY" http://localhost:5000/health' | grep -o '"waiting":[0-9]*' | cut -d: -f2);
  echo "SAMPLE $s pool_waiting=$p load=$(cut -d' ' -f1 /proc/loadavg)";
  sleep 3;
done`;
const ssh = spawn("ssh", ["-i", SSH_KEY, "-o", "BatchMode=yes", "-o", "ServerAliveInterval=15", SSH_HOST, remote]);
let buf = "";
ssh.stdout.on("data", (d) => {
  buf += d;
  let i;
  while ((i = buf.indexOf("\n")) >= 0) {
    const line = buf.slice(0, i).trim();
    buf = buf.slice(i + 1);
    if (!line.startsWith("SAMPLE")) continue;
    const app = /wagerwolf-app-1\|([\d.]+)%\|([^/]+)\//.exec(line);
    const caddy = /wagerwolf-caddy-1\|([\d.]+)%\|([^/]+)\//.exec(line);
    const appMiB = toMiB(app?.[2]), caddyMiB = toMiB(caddy?.[2]);
    const waiting = /pool_waiting=(\d*)/.exec(line)?.[1];
    log(`app cpu=${app?.[1]}% mem=${appMiB.toFixed(0)}MiB | caddy cpu=${caddy?.[1]}% mem=${caddyMiB.toFixed(0)}MiB | pool waiting=${waiting} | ${/load=\S+/.exec(line)?.[0]}`);
    if (caddyMiB > CADDY_MAX) stopK6(`caddy memory ${caddyMiB.toFixed(0)}MiB > ${CADDY_MAX}`);
    if (appMiB > APP_MAX) stopK6(`app memory ${appMiB.toFixed(0)}MiB > ${APP_MAX}`);
  }
});
ssh.stderr.on("data", (d) => log(`ssh: ${String(d).trim()}`));

let healthFails = 0;
const healthTimer = setInterval(async () => {
  try {
    const r = await fetch(HEALTH, { signal: AbortSignal.timeout(5000) });
    healthFails = r.ok ? 0 : healthFails + 1;
    if (!r.ok) log(`health ${r.status}`);
  } catch (e) {
    healthFails++;
    log(`health failed: ${e.name}`);
  }
  if (healthFails >= 3) stopK6("public /health failed 3 times in a row");
}, 5000);

// Exit on its own once k6 is gone.
const k6Timer = setInterval(async () => {
  try { await fetch("http://localhost:6565/v1/status", { signal: AbortSignal.timeout(3000) }); }
  catch { if (!stopped) { log("k6 finished"); finish(); } }
}, 10_000);

let done = false;
function finish() {
  if (done) return;
  done = true;
  clearInterval(healthTimer);
  clearInterval(k6Timer);
  ssh.kill();
  setTimeout(() => process.exit(0), 500);
}
