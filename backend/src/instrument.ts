/**
 * Error tracking and the process's last words. Imported FIRST in index.ts, and
 * the position is the point: Sentry hooks http, express and pg by patching them
 * as they load, so anything imported before this line is invisible to it.
 *
 * OFF UNLESS `SENTRY_DSN` IS SET, the same arrangement as supportMail — dev and
 * CI run with nothing configured and lose nothing but the reporting.
 *
 * Tracing is a separate switch, `SENTRY_TRACES_SAMPLE_RATE`, and is also off by
 * default. The SDK is built on OpenTelemetry, so turning it on gives spans for
 * Express, pg, ioredis and outbound fetch without a collector on the box — which
 * is the tool for attributing a load-test plateau when that run happens.
 *
 * The decisions live in lib/sentryConfig.ts, where they are tested. This file
 * only acts on them.
 */
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
    // THE SDK'S OWN PROCESS HANDLERS ARE REMOVED, because its unhandled-rejection
    // handler defaults to "warn": it would log the rejection and keep the process
    // running, where Node 22 on its own exits. A process in an unknown state that
    // carries on serving is worse than one compose restarts. The handlers below
    // report and then exit, with or without Sentry configured.
    integrations: (defaults) =>
      defaults.filter((i) => i.name !== "OnUncaughtException" && i.name !== "OnUnhandledRejection"),
    beforeSend: scrubEvent,
  });
}

/**
 * A crash used to leave one trace: `/health` reporting a short uptime. Node
 * printed the stack to stderr and exited, and compose brought the container back
 * with nothing on record anywhere a person would look.
 */
const fatal = makeFatalHandler({
  capture: (err, kind) => Sentry.captureException(err, { level: "fatal", tags: { mechanism: kind } }),
  // Bounded, so a Sentry outage cannot keep a broken process alive.
  flush: () => Sentry.flush(2000),
  exit: (code) => process.exit(code),
});

process.on("uncaughtException", (err) => void fatal("uncaughtException", err));
process.on("unhandledRejection", (reason) => void fatal("unhandledRejection", reason));
