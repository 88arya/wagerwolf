// Resolves to the accent (see globals.css :root)
export const ACCENT = "var(--accent)";

/**
 * The last NFL week a league season may occupy. Mirrors
 * `backend/src/services/nflSeason.ts`, which is the authority — the server
 * rejects a season past this week regardless of what the settings form allows,
 * and this copy exists only so the form can say so before the round trip.
 *
 * The two are separate packages with no shared build, so this is the one
 * duplicate that cannot be collapsed. Change both together.
 */
export const MAX_NFL_WEEK = 17;
