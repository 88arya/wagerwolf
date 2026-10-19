// Pings healthchecks.io after each job so a stalled scheduler gets noticed.
// Never throws. Off unless HEALTHCHECKS_PING_KEY is set.
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
