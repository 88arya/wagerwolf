/**
 * League levels and season naming.
 *
 * This file used to be the location half of the profile too — a COUNTRIES list,
 * a REGIONS table for US/CA/AU/GB, formatLocation(), and a guessLocation() that
 * mapped the browser's IANA time zone to a country for the My Account "Detect"
 * button. All of it is gone with User.country and User.region.
 *
 * The reasoning, worth keeping so nobody rebuilds it: location stopped matching
 * anything when the league directory was deleted, and the only purpose left for
 * it was working out what time it is for a user. A time zone answers that; a
 * country does not, since the US spans six of them. guessLocation() was
 * therefore backwards — it read the exact answer off the device and threw it
 * away to store a vaguer one. The zone is now stored directly, by
 * useTimeZoneSync.
 */

export type LeagueLevel = "BEGINNER" | "PRO";

export const LEAGUE_LEVELS: Array<{ value: LeagueLevel; label: string; blurb: string }> = [
  { value: "BEGINNER", label: "Beginner", blurb: "Relaxed. Good place to learn the markets." },
  { value: "PRO",      label: "Pro",      blurb: "Competitive. Everyone here knows the board." },
];

export const LEVEL_LABELS: Record<string, string> = Object.fromEntries(
  LEAGUE_LEVELS.map(l => [l.value, l.label])
);

/** 2026 → "2026–27". Mirrors seasonLabel in backend/src/services/experience.ts. */
export function seasonLabel(year: number): string {
  return `${year}\u2013${String(year + 1).slice(-2)}`;
}
