/**
 * The decisions behind instrument.ts, kept free of side effects so they can be
 * tested. instrument.ts is the only caller; it imports this and then acts.
 */
import type { ErrorEvent } from "@sentry/node";

/** A DSN as pasted into a secret, which often carries a trailing newline. */
export function parseDsn(raw: string | undefined): string | undefined {
  const dsn = raw?.trim();
  return dsn ? dsn : undefined;
}

/**
 * `SENTRY_TRACES_SAMPLE_RATE` as a number Sentry accepts, or undefined for
 * "tracing off". Anything unusable turns tracing OFF rather than guessing: a
 * typo that silently traced every request would cost quota and memory with
 * nothing in the logs to say why. Above 1 is clamped, since "2" can only have
 * meant "everything".
 */
export function parseSampleRate(raw: string | undefined): number | undefined {
  if (raw === undefined || raw.trim() === "") return undefined;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return undefined;
  return Math.min(n, 1);
}

const SECRET_HEADERS = /^(authorization|cookie|x-loadtest-key|x-cron-secret)$/i;

/**
 * Drizzle's DrizzleQueryError message is `Failed query: <sql>\nparams: <values>`,
 * and the values are whatever the route bound: an email, a display name, a
 * support message. The SQL is what makes the error debuggable and is kept; the
 * values are not needed to read a stack trace and are dropped.
 */
const PARAMS = /\nparams: [\s\S]*$/;
export function scrubQueryParams(text: string): string {
  return text.replace(PARAMS, "\nparams: [scrubbed]");
}

/**
 * Everything removed before an event leaves the box:
 *
 *   - request bodies, which carry support messages and email addresses
 *   - cookies and the secret-bearing headers, matched case-insensitively
 *     because Node lowercases headers but nothing guarantees a caller did
 *   - the user's IP, which the SDK attaches even with default PII off (measured)
 *   - bound SQL parameters, from the exception values and the message
 */
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

/**
 * The process's last words. Returns the handler instrument.ts registers for
 * both `uncaughtException` and `unhandledRejection`.
 *
 * Registering a listener stops Node exiting on its own, so the handler must
 * exit itself, and the exit is in a `finally`: if reporting throws, or the flush
 * rejects, the process still dies. Without that, a failure inside the reporting
 * would leave a process in an unknown state serving traffic forever, which is
 * the one outcome this exists to prevent. A second failure while the first is
 * flushing is logged and nothing more, so it cannot start a second shutdown.
 */
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
