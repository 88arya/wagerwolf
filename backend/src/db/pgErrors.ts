/**
 * Recognising Postgres errors through Drizzle's wrapper.
 *
 * Drizzle raises a `DrizzleQueryError` and hangs the driver's error off
 * `cause`, so the `err.code === "23505"` checks written against node-postgres
 * never match — they silently fell through to a 500 with the full SQL and
 * bound parameters in the response body. Every unique-violation handler in the
 * app was affected: a duplicate league join answered 500 instead of 409 and
 * leaked the query text.
 *
 * `cause` is walked rather than read once because the wrapping is not
 * guaranteed to be single-layer, and an unrecognised shape must degrade to
 * "not a unique violation" rather than throwing from inside a catch block.
 */

/** Postgres SQLSTATE 23505 — unique_violation. */
const UNIQUE_VIOLATION = "23505";

function findPgCode(err: unknown, depth = 0): string | null {
  if (!err || typeof err !== "object" || depth > 5) return null;
  const code = (err as any).code;
  if (typeof code === "string") return code;
  return findPgCode((err as any).cause, depth + 1);
}

export function isUniqueViolation(err: unknown): boolean {
  return findPgCode(err) === UNIQUE_VIOLATION;
}
