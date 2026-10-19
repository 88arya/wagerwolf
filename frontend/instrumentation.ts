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

export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  if (!dsn || process.env.NEXT_RUNTIME !== "nodejs") return;
  const Sentry = await import("@sentry/nextjs");
  const digest = typeof err === "object" && err !== null && "digest" in err ? String(err.digest) : undefined;
  Sentry.withScope((scope) => {
    if (digest) scope.setTag("digest", digest);
    Sentry.captureRequestError(err, request, context);
  });
};
