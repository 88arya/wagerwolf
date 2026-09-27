/**
 * A dead man's switch for the scheduler, on healthchecks.io.
 *
 * Error tracking only speaks when something throws. The worst way this app can
 * fail throws nothing: Redis restarts without its job schedulers, or the worker
 * wedges, and the season simply stops — no resolve, no score sync, no
 * allowances, and nothing in any log. The only way to notice an absence is
 * something outside the box expecting a ping and alerting when it stops coming.
 *
 * Every job pings its own check after each run: success, or `/fail` if any step
 * failed. Checks are addressed by slug under one project ping key, and
 * `?create=1` makes healthchecks.io create a check on its first ping, so adding
 * a job needs no setup here. Each auto-created check does need its schedule set
 * once in the healthchecks.io dashboard, or it falls back to their default
 * period of one day.
 *
 * OFF UNLESS `HEALTHCHECKS_PING_KEY` IS SET. `HEALTHCHECKS_PING_URL` overrides the
 * host, for a self-hosted instance or a test.
 *
 * A ping can never fail a job: it is bounded by a timeout and every error is
 * swallowed, because a monitoring outage must not stop the work it monitors.
 * It is NOT silent, though. A rejected ping is logged, because the likeliest
 * cause is a wrong key, and a wrong key means every check stays empty and the
 * alert this exists for never fires.
 */
const DEFAULT_BASE = "https://hc-ping.com";
export const HEARTBEAT_TIMEOUT_MS = 5000;

/** A job name as a healthchecks slug: lowercase letters, digits, dashes. */
export function toSlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "");
}

export function heartbeatUrl(slug: string, ok: boolean, env = process.env): string | undefined {
  const key = env.HEALTHCHECKS_PING_KEY?.trim();
  if (!key) return undefined;
  const base = (env.HEALTHCHECKS_PING_URL?.trim() || DEFAULT_BASE).replace(/\/+$/, "");
  return `${base}/${encodeURIComponent(key)}/${toSlug(slug)}${ok ? "" : "/fail"}?create=1`;
}

export async function heartbeat(slug: string, ok: boolean, timeoutMs = HEARTBEAT_TIMEOUT_MS) {
  const url = heartbeatUrl(slug, ok);
  if (!url) return;
  try {
    const res = await fetch(url, { method: "POST", signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) {
      console.warn(`[heartbeat] ${slug}: healthchecks answered ${res.status}; check HEALTHCHECKS_PING_KEY`);
    }
  } catch (err) {
    console.warn(`[heartbeat] ${slug}: ping failed`, err instanceof Error ? err.message : err);
  }
}
