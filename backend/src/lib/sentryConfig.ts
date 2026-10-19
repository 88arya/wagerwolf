import type { ErrorEvent } from "@sentry/node";

/** A DSN as pasted into a secret, which often carries a trailing newline. */
export function parseDsn(raw: string | undefined): string | undefined {
  const dsn = raw?.trim();
  return dsn ? dsn : undefined;
}

// Invalid values disable tracing rather than guess.
export function parseSampleRate(raw: string | undefined): number | undefined {
  if (raw === undefined || raw.trim() === "") return undefined;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return undefined;
  return Math.min(n, 1);
}

const SECRET_HEADERS = /^(authorization|cookie|x-loadtest-key|x-cron-secret)$/i;

// Drizzle error messages include bound params (emails etc.); keep the SQL, drop those.
const PARAMS = /\nparams: [\s\S]*$/;
export function scrubQueryParams(text: string): string {
  return text.replace(PARAMS, "\nparams: [scrubbed]");
}

// Strips bodies, cookies, secret headers, IP and SQL params before sending.
export function scrubEvent(event: ErrorEvent): ErrorEvent {
  if (event.user) delete event.user.ip_address;

  if (event.request) {
    delete event.request.data;
    delete event.request.cookies;
    const headers = event.request.headers;
    if (headers) {
      for (const h of Object.keys(headers)) if (SECRET_HEADERS.test(h)) delete headers[h];
    }
  }

  for (const ex of event.exception?.values ?? []) {
    if (typeof ex.value === "string") ex.value = scrubQueryParams(ex.value);
  }
  if (typeof event.message === "string") event.message = scrubQueryParams(event.message);

  return event;
}

// Exit is in finally so the process dies even if reporting fails.
export function makeFatalHandler(deps: {
  capture: (err: unknown, kind: string) => void;
  flush: () => Promise<unknown>;
  exit: (code: number) => void;
  log?: (...args: unknown[]) => void;
}) {
  const log = deps.log ?? console.error;
  let dying = false;
  return async function fatal(kind: string, err: unknown) {
    log(`[fatal] ${kind}:`, err);
    if (dying) return;
    dying = true;
    try {
      deps.capture(err, kind);
      await deps.flush();
    } catch (reportErr) {
      log("[fatal] reporting the failure also failed:", reportErr);
    } finally {
      deps.exit(1);
    }
  };
}
