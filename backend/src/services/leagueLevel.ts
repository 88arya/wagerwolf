export type LeagueLevel = "BEGINNER" | "PRO";

export const LEAGUE_LEVELS: Array<{ value: LeagueLevel; label: string; blurb: string }> = [
  { value: "BEGINNER", label: "Beginner", blurb: "Relaxed. Good place to learn the markets." },
  { value: "PRO",      label: "Pro",      blurb: "Competitive. Everyone here knows the board." },
];

export const DEFAULT_LEVEL: LeagueLevel = "BEGINNER";

export function isLeagueLevel(v: unknown): v is LeagueLevel {
  return v === "BEGINNER" || v === "PRO";
}

/** Falls back rather than throwing - an unknown level is a beginner league. */
export function coerceLevel(v: unknown): LeagueLevel {
  return isLeagueLevel(v) ? v : DEFAULT_LEVEL;
}
