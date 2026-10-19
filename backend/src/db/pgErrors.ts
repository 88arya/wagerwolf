/** Postgres SQLSTATE 23505 - unique_violation. */
const UNIQUE_VIOLATION = "23505";

function findPgCode(err: unknown, depth = 0): string | null {
  if (!err || typeof err !== "object" || depth > 5) return null;
  const code = (err as any).code;
  if (typeof code === "string") return code;
  return findPgCode((err as any).cause, depth + 1);
}

// Drizzle wraps driver errors and puts the original on `cause`, so walk it.
export function isUniqueViolation(err: unknown): boolean {
  return findPgCode(err) === UNIQUE_VIOLATION;
}
