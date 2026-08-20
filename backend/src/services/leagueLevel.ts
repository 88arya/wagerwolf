/**
 * The two kinds of league.
 *
 * This replaced a five-tier skill band (ANY / ROOKIE / CASUAL / SEASONED /
 * VETERAN) backed by a numeric `minExperience`/`maxExperience` range, plus a
 * location scope. All of it was matching machinery for a browsable directory
 * that no longer exists — one axis with two values is what a player actually
 * needs to answer: *do I want a gentle game or a serious one?*
 *
 * It is a **choice, not a gate.** Nothing checks tenure before letting someone
 * into a PRO league. That is deliberate: `seasonsPlayed` (services/experience.ts)
 * is still derived from the account's join date and shown on the profile, but on
 * a young platform every account is a rookie, so gating PRO on it would make PRO
 * unreachable for everyone. Self-selection sorts people well enough, and it
 * cannot be gamed in a way that matters — picking PRO when you are new gets you
 * a harder game, which is the thing you asked for.
 */

export type LeagueLevel = "BEGINNER" | "PRO";

export const LEAGUE_LEVELS: Array<{ value: LeagueLevel; label: string; blurb: string }> = [
  { value: "BEGINNER", label: "Beginner", blurb: "Relaxed. Good place to learn the markets." },
  { value: "PRO",      label: "Pro",      blurb: "Competitive. Everyone here knows the board." },
];

export const DEFAULT_LEVEL: LeagueLevel = "BEGINNER";

export function isLeagueLevel(v: unknown): v is LeagueLevel {
  return v === "BEGINNER" || v === "PRO";
}

/** Falls back rather than throwing — an unknown level is a beginner league. */
export function coerceLevel(v: unknown): LeagueLevel {
  return isLeagueLevel(v) ? v : DEFAULT_LEVEL;
}
