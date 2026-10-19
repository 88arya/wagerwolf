// Prices alt prop lines: the book's ladder if there is one, else a linear
// fallback. Server-side so clients can't choose their own odds.

export interface AltRung {
  line: number;
  over: number;
  under: number;
}

export function propStep(statType: string): number {
  const yardTypes = [
    "PASSING_YARDS", "RUSHING_YARDS", "RECEIVING_YARDS",
    "PASSING_LONGEST", "RUSHING_LONGEST", "RECEIVING_LONGEST", "FIELD_GOAL_LONGEST",
  ];
  if (yardTypes.includes(statType)) return 5;
  if (statType === "KICKING_POINTS") return 1;
  return 0.5;
}

/** The pre-existing linear model: ±15 cents per step away from the main line. */
export function fabricateAltOdds(
  baseOdds: number,
  baseLine: number,
  altLine: number,
  statType: string,
  direction: string,
): number {
  const step = propStep(statType);
  const steps = (altLine - baseLine) / step;
  const favSteps = direction === "OVER" ? -steps : steps;
  return Math.max(-500, Math.min(500, baseOdds - Math.round(favSteps * 15)));
}

/** American odds -> implied probability (includes the book's vig). */
export function impliedProb(american: number): number {
  return american > 0 ? 100 / (american + 100) : -american / (-american + 100);
}
function rungFor(ladder: AltRung[] | null | undefined, line: number): AltRung | null {
  if (!ladder?.length) return null;
  return ladder.find((r) => Math.abs(r.line - line) < 0.001) ?? null;
}

export function altOddsFor(
  prop: { line: number; odds: number; statType: string; altLadder?: AltRung[] | null },
  altLine: number | null | undefined,
  direction: string,
): number {
  if (altLine == null) return prop.odds;

  const rung = rungFor(prop.altLadder, altLine);
  if (rung) return direction === "OVER" ? rung.over : rung.under;

  return fabricateAltOdds(prop.odds, prop.line, Number(altLine), prop.statType, direction);
}
