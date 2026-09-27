/**
 * Where a failure goes once it has been caught. Every call still prints to
 * stderr, so `docker compose logs` stays complete; with `SENTRY_DSN` set it is
 * also sent to Sentry, which is what turns a log line into something that alerts.
 * Unconfigured, the Sentry calls are no-ops. See instrument.ts.
 */
import * as Sentry from "@sentry/node";

type Tags = Record<string, string | number | undefined>;

function clean(tags: Tags) {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(tags)) if (v !== undefined) out[k] = String(v);
  return out;
}

/** An exception somebody should look at. */
export function reportError(label: string, err: unknown, tags: Tags = {}) {
  console.error(label, err);
  Sentry.captureException(err, { tags: clean(tags) });
}

/**
 * A condition rather than an exception: nothing threw, but the state is wrong
 * and a human has to act — a week stuck unresolved, an allowance missed.
 *
 * `fingerprint` groups every repeat of the condition into one Sentry issue.
 * These fire hourly while the condition holds, and the message carries a count
 * that changes each time; without a fingerprint, each hour would be a new issue
 * and a new alert.
 */
export function reportCondition(message: string, fingerprint: string[], tags: Tags = {}) {
  console.error(message);
  Sentry.captureMessage(message, { level: "warning", fingerprint, tags: clean(tags) });
}
