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

// For bad states rather than exceptions. Fingerprint groups repeats into one issue.
export function reportCondition(message: string, fingerprint: string[], tags: Tags = {}) {
  console.error(message);
  Sentry.captureMessage(message, { level: "warning", fingerprint, tags: clean(tags) });
}
