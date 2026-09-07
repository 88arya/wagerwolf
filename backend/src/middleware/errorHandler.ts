/**
 * The one place an unexpected failure becomes a response.
 *
 * Every route used to end `catch (err: any) { res.status(500).json({ error:
 * err.message }) }` — 64 copies of it. Two problems with that, and the second
 * is the reason this file exists:
 *
 *   1. It hands the caller the raw error. A Drizzle unique-violation once came
 *      back as a 500 carrying the full SQL statement and its bound parameters.
 *      A driver message is written for whoever is reading the logs, and it is
 *      written on the assumption that person is trusted.
 *   2. Nothing was written to the logs at all. The message went to the client
 *      and nowhere else, so a production failure left no trace on the box.
 *
 * So: the client gets a generic sentence plus a correlation id, and the id is
 * printed beside the real stack on stderr. A user reporting "it said error
 * a3f1c2" is a grep away from the cause.
 *
 * In development the real message is included too — there is nobody to protect
 * from it, and hiding it while you are the one debugging costs an extra window.
 */
import { randomUUID } from "crypto";

/** Throw this when the status is deliberate and the message is safe to show. */
export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "HttpError";
  }
}

const isProd = process.env.NODE_ENV === "production";

export function errorHandler(err: any, _req: any, res: any, _next: any) {
  // A handler that already answered — a stream that failed mid-write, say —
  // cannot be answered again; handing it to Express closes the socket.
  if (res.headersSent) return _next(err);

  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message });
    return;
  }

  const errorId = randomUUID().slice(0, 8);
  console.error(`[${errorId}]`, err?.stack || err);

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
