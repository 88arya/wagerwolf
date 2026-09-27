/**
 * Server-side error reporting for the Next server. Its client half is
 * instrumentation-client.ts.
 *
 * OFF UNLESS `NEXT_PUBLIC_SENTRY_DSN` WAS SET AT BUILD TIME. It is a
 * NEXT_PUBLIC_ variable because the browser needs the same DSN, and NEXT_PUBLIC_
 * values are inlined into the server bundle as well, so one build arg covers both.
 * A DSN is public by design: it can only submit events.
 *
 * Imported dynamically, and only on the Node runtime, so an unconfigured build
 * never loads the SDK on the server at all.
 */
import type { Instrumentation } from "next";

// Trimmed: a value pasted into a repository variable often carries a newline.
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN?.trim() || undefined;

export async function register() {
  if (!dsn || process.env.NEXT_RUNTIME !== "nodejs") return;
  const Sentry = await import("@sentry/nextjs");
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV,
    release: process.env.NEXT_PUBLIC_GIT_COMMIT_SHA || undefined,
    // The SDK attaches the client's IP even with default PII off (measured).
    beforeSend(event) {
      if (event.user) delete event.user.ip_address;
      if (event.request) {
        delete event.request.cookies;
        if (event.request.headers) delete event.request.headers.cookie;
      }
      return event;
    },
  });
}

/**
 * Next calls this for every error a server render, route handler or action
 * throws. Before it existed, those errors reached the container's stdout and
 * nowhere else; the user saw `error.tsx` and a digest nobody could look up.
 *
 * The digest is the "Reference" error.tsx shows, so it is tagged here: a user
 * quoting it is then a search in Sentry, the same as the backend's errorId.
 */
export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  if (!dsn || process.env.NEXT_RUNTIME !== "nodejs") return;
  const Sentry = await import("@sentry/nextjs");
  const digest = typeof err === "object" && err !== null && "digest" in err ? String(err.digest) : undefined;
  Sentry.withScope((scope) => {
    if (digest) scope.setTag("digest", digest);
    Sentry.captureRequestError(err, request, context);
  });
};
