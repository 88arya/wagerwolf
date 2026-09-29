/**
 * Has every game in a week been played to a final score?
 *
 * The trigger for the EARLY ROLLOVER in scheduler.ts: once this is true the
 * week can be resolved and the next one opened without waiting for `endDate`,
 * which is the last kickoff plus 18 hours and so lands mid-afternoon Tuesday.
 *
 * FINAL ONLY — a CANCELLED game holds the week to its deadline. `espnApi` maps
 * ESPN's POSTPONED to CANCELLED, so the two cannot be told apart here, and
 * resolving voids every bet on a cancelled game. A game postponed to Tuesday
 * night would be refunded hours before it is played. The deadline path still
 * resolves those weeks exactly as before; only the shortcut declines them.
 *
 * An empty week is not finished: a week with no games is one whose schedule
 * never landed, not one that is over.
 *
 * No imports on purpose, so it is testable without a database.
 */
export function allGamesFinal(games: ReadonlyArray<{ status: string }>): boolean {
  return games.length > 0 && games.every((g) => g.status === "FINAL");
}
