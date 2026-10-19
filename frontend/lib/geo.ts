export type LeagueLevel = "BEGINNER" | "PRO";

export const LEAGUE_LEVELS: Array<{ value: LeagueLevel; label: string; blurb: string }> = [
  { value: "BEGINNER", label: "Beginner", blurb: "Relaxed. Good place to learn the markets." },
  { value: "PRO",      label: "Pro",      blurb: "Competitive. Everyone here knows the board." },
];