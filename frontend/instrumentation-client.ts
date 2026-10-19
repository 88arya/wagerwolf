import * as Sentry from "@sentry/browser";

// Trimmed: a value pasted into a repository variable often carries a newline.
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN?.trim() || undefined;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV,
    release: process.env.NEXT_PUBLIC_GIT_COMMIT_SHA || undefined,
  });
}
