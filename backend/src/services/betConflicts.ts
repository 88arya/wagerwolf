// Parlay conflict detection; mirrors frontend/lib/conflicts.ts, but this copy is
// the one that blocks. Each leg is a bound on one variable: disjoint bounds are a
// contradiction, one inside another is nesting, partial overlap is fine.
// Moneyline is treated as a spread of 0.

export type ConflictKind = "CONTRADICTION" | "NESTED";

/** The fields this module needs from a resolved parlay leg. */
export interface ConflictLeg {
  type: "prop" | "gameline";
  id: string;
  direction?: string;
  market?: string | null;
  line?: number | null;
  altLine?: number | null;
  statType?: string | null;
  playerId?: string | null;
  gameId?: string | null;
}

/** Inclusive bound on `variable`. ±Infinity for an open end. */
interface Bound {
  variable: string;
  lo: number;
  hi: number;
}

const EPS = 1e-9;

// Sacks come in halves; everything else is whole numbers.
function granularity(statType?: string | null): number {
  return statType === "SACKS" ? 0.5 : 1;
}

/** Smallest grid value strictly greater than `n`. */
function nextAbove(n: number, g: number): number {
  const q = n / g;
  const f = Math.floor(q + EPS);
  return (Math.abs(q - f) < EPS ? f + 1 : Math.ceil(q - EPS)) * g;
}

/** Largest grid value strictly less than `n`. */
function nextBelow(n: number, g: number): number {
  const q = n / g;
  const c = Math.ceil(q - EPS);
  return (Math.abs(q - c) < EPS ? c - 1 : Math.floor(q + EPS)) * g;
}

// Pairs where the left stat can't exceed the right (longest reception <= yards).
const STAT_AT_MOST: Array<[string, string]> = [
  ["PASSING_LONGEST", "PASSING_YARDS"],
  ["RUSHING_LONGEST", "RUSHING_YARDS"],
  ["RECEIVING_LONGEST", "RECEIVING_YARDS"],
  ["PASSING_COMPLETIONS", "PASSING_ATTEMPTS"],
  ["RECEPTIONS", "RECEIVING_TARGETS"],
  ["RUSHING_TOUCHDOWNS", "TOUCHDOWNS"],
  ["RECEIVING_TOUCHDOWNS", "TOUCHDOWNS"],
  ["FIELD_GOALS_MADE", "KICKING_POINTS"],
  ["EXTRA_POINTS_MADE", "KICKING_POINTS"],
];

function atMost(a?: string | null, b?: string | null): boolean {
  if (!a || !b) return false;
  return STAT_AT_MOST.some(([lo, hi]) => lo === a && hi === b);
}

function propVariable(leg: ConflictLeg): string {
  if (leg.statType) return `stat:${leg.playerId ?? leg.id}:${leg.statType}`;
  return `prop:${leg.id}`;
}

/** The bound a leg places on its variable, or null if it can't be modelled. */
function legBound(leg: ConflictLeg): Bound | null {
  const line = leg.altLine ?? leg.line;

  if (leg.type === "prop") {
    if (!leg.direction || line == null) return null;
    const g = granularity(leg.statType);
    const variable = propVariable(leg);
    return leg.direction === "OVER"
      ? { variable, lo: nextAbove(line, g), hi: Infinity }
      : { variable, lo: -Infinity, hi: nextBelow(line, g) };
  }

  const market = leg.market;
  if (!market || !leg.gameId) return null;

  // Moneyline and spread both constrain the same variable: home margin.
  const margin = `margin:${leg.gameId}`;

  if (market.includes("MONEYLINE")) {
    return market.includes("HOME")
      ? { variable: margin, lo: 1, hi: Infinity }
      : { variable: margin, lo: -Infinity, hi: -1 };
  }

  if (market.includes("SPREAD")) {
    if (line == null) return null;
    // Home covers when margin > -line; away covers when margin < line.
    return market.includes("HOME")
      ? { variable: margin, lo: nextAbove(-line, 1), hi: Infinity }
      : { variable: margin, lo: -Infinity, hi: nextBelow(line, 1) };
  }

  if (market.includes("TOTAL")) {
    if (line == null) return null;
    const variable = `total:${leg.gameId}`;
    return market.includes("UNDER")
      ? { variable, lo: -Infinity, hi: nextBelow(line, 1) }
      : { variable, lo: nextAbove(line, 1), hi: Infinity };
  }

  return null;
}

/** How two legs conflict, or null if they can share a parlay. */
export function conflictBetween(a: ConflictLeg, b: ConflictLeg): ConflictKind | null {
  const ba = legBound(a);
  const bb = legBound(b);
  if (!ba || !bb) return null;

  if (ba.variable === bb.variable) {
    const lo = Math.max(ba.lo, bb.lo);
    const hi = Math.min(ba.hi, bb.hi);
    if (lo > hi) return "CONTRADICTION";
    // Equal ranges contain each other, which is the duplicate-leg case.
    const aInB = bb.lo <= ba.lo && ba.hi <= bb.hi;
    const bInA = ba.lo <= bb.lo && bb.hi <= ba.hi;
    if (aInB || bInA) return "NESTED";
    return null;
  }

  if (a.type !== "prop" || b.type !== "prop") return null;
  if ((a.playerId ?? a.id) !== (b.playerId ?? b.id)) return null;

  if (atMost(a.statType, b.statType) && ba.lo > bb.hi) return "CONTRADICTION";
  if (atMost(b.statType, a.statType) && bb.lo > ba.hi) return "CONTRADICTION";

  return null;
}

export function findFirstConflict(
  legs: ConflictLeg[],
): { a: ConflictLeg; b: ConflictLeg; kind: ConflictKind } | null {
  for (let i = 0; i < legs.length; i++) {
    for (let j = i + 1; j < legs.length; j++) {
      const kind = conflictBetween(legs[i], legs[j]);
      if (kind) return { a: legs[i], b: legs[j], kind };
    }
  }
  return null;
}

/** "ALT_TOTAL_OVER_45" -> "total over"; prop legs describe player and stat. */
export function legLabel(leg: ConflictLeg): string {
  if (leg.type === "prop") {
    const stat = (leg.statType ?? "prop").split("_").join(" ").toLowerCase();
    const line = leg.altLine ?? leg.line;
    return `${leg.direction?.toLowerCase() ?? ""} ${line ?? ""} ${stat}`.trim();
  }
  const market = leg.market ?? "";
  if (market.includes("MONEYLINE")) return market.includes("HOME") ? "home moneyline" : "away moneyline";
  if (market.includes("SPREAD")) return `${market.includes("HOME") ? "home" : "away"} spread ${leg.altLine ?? leg.line ?? ""}`.trim();
  if (market.includes("TOTAL")) return `total ${market.includes("UNDER") ? "under" : "over"} ${leg.altLine ?? leg.line ?? ""}`.trim();
  return "this selection";
}

/** Human-readable reason, for the 409 body. */
export function conflictMessage(a: ConflictLeg, b: ConflictLeg, kind: ConflictKind): string {
  return kind === "CONTRADICTION"
    ? `Conflicting legs — "${legLabel(a)}" and "${legLabel(b)}" cannot both win`
    : `Redundant legs — "${legLabel(a)}" and "${legLabel(b)}" bet the same outcome`;
}
