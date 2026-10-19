// Clients get a generic message plus an id; the real error is logged with it.
import { randomUUID } from "crypto";
import * as Sentry from "@sentry/node";

/** Throw this when the status is deliberate and the message is safe to show. */
export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "HttpError";
  }
}

// Body-parser errors (bad JSON, too large) are 4xx, not server faults.
function clientError(err: any): { status: number; message: string } | null {
  const status = err?.status ?? err?.statusCode;
  if (!Number.isInteger(status) || status < 400 || status > 499) return null;
  return { status, message: err.expose ? String(err.message) : "Bad request" };
}

export function errorHandler(err: any, _req: any, res: any, _next: any) {
  if (res.headersSent) return _next(err);

  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message });
    return;
  }

  const client = clientError(err);
  if (client) {
    res.status(client.status).json({ error: client.message });
    return;
  }

  // Read per call rather than at import, so it cannot be captured stale.
  const isProd = process.env.NODE_ENV === "production";

  const errorId = randomUUID().slice(0, 8);
  console.error(`[${errorId}]`, err?.stack || err);
  Sentry.withScope((scope) => {
    scope.setTag("errorId", errorId);
    if (_req.userId) scope.setUser({ id: String(_req.userId) });
    Sentry.captureException(err);
  });

  res.status(500).json({
    error: "Something went wrong. Please try again.",
    errorId,
    ...(isProd ? {} : { detail: String(err?.message ?? err) }),
  });
}

/** Terminal 404 for a path no router claimed. */
export function notFoundHandler(_req: any, res: any) {
  res.status(404).json({ error: "Not found" });
}
