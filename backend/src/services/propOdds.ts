/**
 * Alternate prop line pricing.
 *
 * Two sources, in priority order:
 *
 * 1. `prop.altLadder` — the book's real ladder, written by the SharpAPI sync.
 *    FanDuel posts prop alternates as milestones ("Cooper Kupp 4+ Receptions"),
 *    which is the same thing as Over 3.5, so the ladder is stored as ordinary
 *    over/under pairs at .5 lines.
 *
 * 2. The linear fallback below, for a real prop whose market the book posted a
 *    main line for but no ladder.
 *
 * The fallback is a straight line — a fixed number of cents per half-step — and
 * the real ladders show how wrong that is. Cooper Kupp's receptions run
 * 2+ @ -340 → 7+ @ +1700, which is nowhere near linear in either direction.
 * That gap is the whole reason for preferring the ladder.
 *
 * This module is the single server-side authority. `picks.routes.ts` and
 * `parlays.routes.ts` both price bets through it, so a client cannot name its
 * own odds.
 */

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

/** American odds → implied probability (includes the book's vig). */
export function impliedProb(american: number): number {
  return american > 0 ? 100 / (american + 100) : -american / (-american + 100);
}

/** Implied probability → American odds. Inverse of impliedProb. */
export function fromImpliedProb(p: number): number {
  const clamped = Math.min(0.9999, Math.max(0.0001, p));
  return clamped >= 0.5
    ? -Math.round((clamped / (1 - clamped)) * 100)
    : Math.round(((1 - clamped) / clamped) * 100);
}

function rungFor(ladder: AltRung[] | null | undefined, line: number): AltRung | null {
  if (!ladder?.length) return null;
  return ladder.find((r) => Math.abs(r.line - line) < 0.001) ?? null;
}

/**
 * Price one side of a prop at `altLine`.
 *
 * `altLine == null` (or equal to the main line) means the main line, which is
 * priced off the prop row itself rather than the ladder — the two agree, but the
 * prop row is what settlement reads.
 */
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

/**
 * The set of lines a player can be bet at — the real ladder when there is one,
 * otherwise the fixed offsets around the main line that the UI has always drawn.
 */
export const FABRICATED_OFFSETS = [-2, -1, 0, 1, 2];

export function altLinesFor(
  prop: { line: number; statType: string; altLadder?: AltRung[] | null },
): number[] {
  if (prop.altLadder?.length) return prop.altLadder.map((r) => r.line);
  const step = propStep(prop.statType);
  return FABRICATED_OFFSETS
    .map((o) => Math.round((prop.line + o * step) * 100) / 100)
    .filter((l) => l > 0);
}
