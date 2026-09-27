/**
 * Browser error reporting. Runs before the app becomes interactive, which is
 * what lets it catch an error thrown during hydration. See instrumentation.ts
 * for the server half and for why the DSN is a NEXT_PUBLIC_ build arg.
 *
 * Errors only. No tracing and no session replay: replay records the screen, and
 * that is a decision for the Privacy Policy before it is one for this file.
 */
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
