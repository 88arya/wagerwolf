// Must be the first import in index.ts so Sentry can patch modules as they load.
// Off unless SENTRY_DSN is set.
import * as Sentry from "@sentry/node";
import dotenv from "dotenv";
import { makeFatalHandler, parseDsn, parseSampleRate, scrubEvent } from "./lib/sentryConfig";

dotenv.config({ quiet: true });

const dsn = parseDsn(process.env.SENTRY_DSN);
const tracesSampleRate = parseSampleRate(process.env.SENTRY_TRACES_SAMPLE_RATE);

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV ?? "development",
    release: process.env.GIT_COMMIT_SHA || undefined,
    ...(tracesSampleRate !== undefined ? { tracesSampleRate } : {}),
    // Drop Sentry's own process handlers: its rejection handler only warns and
    // keeps the process running. Ours report and exit.
    integrations: (defaults) =>
      defaults.filter((i) => i.name !== "OnUncaughtException" && i.name !== "OnUnhandledRejection"),
    beforeSend: scrubEvent,
  });
}

const fatal = makeFatalHandler({
  capture: (err, kind) => Sentry.captureException(err, { level: "fatal", tags: { mechanism: kind } }),
  // Bounded, so a Sentry outage cannot keep a broken process alive.
  flush: () => Sentry.flush(2000),
  exit: (code) => process.exit(code),
});

process.on("uncaughtException", (err) => void fatal("uncaughtException", err));
process.on("unhandledRejection", (reason) => void fatal("unhandledRejection", reason));
