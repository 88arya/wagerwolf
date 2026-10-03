/**
 * A Week row for embedding under a bet, without `publicBoard`.
 *
 * `publicBoard` is the landing page's frozen market sample, ~25 kB of jsonb on
 * a live week. `/picks`, `/gamepicks` and `/parlays` embed the week under every
 * bet (`prop → game → week`), so each bet a user holds dragged a copy of it out
 * of Postgres: fifty bets, ~1.25 MB per My Bets load. Nothing that reads those
 * routes looks at it.
 *
 * Drizzle reads an all-false `columns` map as "everything except these", so the
 * rest of the row still comes back and callers are unaffected.
 */
export const WEEK_WITHOUT_BOARD = { columns: { publicBoard: false } } as const;
