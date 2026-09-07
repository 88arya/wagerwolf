/**
 * The only shape of a `User` row that may leave the server for somebody else.
 *
 * Every league route loads members through a Drizzle relation, and the obvious
 * spelling — `with: { user: true }` — selects the whole table. That table holds
 * `email`, the `password` bcrypt hash, `googleId`, `firstName`/`lastName`,
 * `timeZone` and `ageConfirmedAt`. Four routes were shipping all of it to any
 * authenticated caller who knew a league id.
 *
 * So the relation is never loaded whole. `PUBLIC_USER_COLUMNS` goes in the
 * relational query's `columns` slot and narrows the SELECT itself, which means
 * a route cannot leak a column by forgetting to strip it on the way out — the
 * column was never fetched. Measured against the callers: `id` and
 * `displayName` are the only two fields any route actually reads.
 *
 * This is the peer of `ME_COLUMNS` in routes/users.routes.ts, which does the
 * same job for the one route allowed to return private fields — a user's own.
 * Adding a column here makes it visible to every other player in the league;
 * that is the question to ask before adding one.
 */
export const PUBLIC_USER_COLUMNS = {
  id: true,
  displayName: true,
} as const;

/** Ready to spread into a relational query: `with: { user: PUBLIC_USER }`. */
export const PUBLIC_USER = { columns: PUBLIC_USER_COLUMNS } as const;

export type PublicUser = { id: string; displayName: string };
