// Conflict detection for bet slip legs.
//
// Replaces the market-string tables this used to rely on (OPPOSITE_MARKET /
// CONFLICT_MARKETS / CROSS_CONFLICTS), which compared market *names* and were
// therefore blind to two things: the line value (so ALT_ markets slipped
// through, and legitimate bands like Over 40 + Under 48 got blocked) and which
// side was actually favoured (so "A moneyline + B +3" was rejected even though
// A winning by 1 wins both legs).
//
// Model: every leg becomes an inclusive bound on one random variable. Two legs
// on the same variable are compared by intersecting their bounds:
//
//   empty intersection      → CONTRADICTION  (they can never both win)
//   one range inside other  → NESTED         (compound odds on a single event)
//   partial overlap         → no conflict    (a legitimate band)
//
// Moneyline is just a spread at 0, so the cross-market cases fall out with the
// correct sign instead of needing a hand-maintained table.
//
// Only *logical* conflicts are detected. Correlated-but-possible combinations
// (a QB's passing TDs and his team's moneyline) are deliberately allowed —
// that's a pricing question, not a conflict.

export type ConflictKind = "CONTRADICTION" | "NESTED";

/** The subset of a slip leg this module needs. */
export interface ConflictLeg {
  key: string;
  type: "prop" | "gameline";
  id: string;
  direction?: "OVER" | "UNDER";
  market?: string;
  line?: number;
  altLine?: number;
  statType?: string;
  playerId?: string;
  gameId?: string;
}

/** Inclusive bound on `variable`. ±Infinity for an open end. */
interface Bound {
  variable: string;
  lo: number;
  hi: number;
}

const EPS = 1e-9;

// Every stat here is whole-numbered except sacks, which are credited in halves.
// Granularity matters: on an integer stat "Over 2" and "Over 2.5" are the same
// event (3 or more), so they must canonicalise to the same bound or the pair
// reads as a legitimate band instead of a duplicate.
function granularity(statType?: string): number {
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

/**
 * Same-player stats where the left value can never exceed the right. Used to
 * carry a bound from one variable to the other so cross-stat impossibilities
 * (over 60 longest reception + under 50 receiving yards) are caught.
 */
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

function atMost(a?: string, b?: string): boolean {
  if (!a || !b) return false;
  return STAT_AT_MOST.some(([lo, hi]) => lo === a && hi === b);
}

function propVariable(leg: ConflictLeg): string {
  // Prefer player+stat so two different prop rows for the same market still
  // land on one variable; fall back to the prop id when the stat is unknown.
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

  // Both moneyline and spread constrain the same variable: home margin.
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

/** How two legs conflict, or null if they can coexist in a parlay. */
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

  // Different variables: only a declared same-player constraint can make the
  // pair impossible. A single "x ≤ y" can't produce nesting, so contradiction
  // is the only verdict available here.
  if (a.type !== "prop" || b.type !== "prop") return null;
  if ((a.playerId ?? a.id) !== (b.playerId ?? b.id)) return null;

  if (atMost(a.statType, b.statType) && ba.lo > bb.hi) return "CONTRADICTION";
  if (atMost(b.statType, a.statType) && bb.lo > ba.hi) return "CONTRADICTION";

  return null;
}

export interface ConflictPair {
  a: ConflictLeg;
  b: ConflictLeg;
  kind: ConflictKind;
}

export interface ConflictResult {
  /** Keys of every leg involved in at least one conflict. */
  keys: Set<string>;
  pairs: ConflictPair[];
}

/** Every conflicting pair in a slip, plus the set of legs to flag. */
export function findConflicts(legs: ConflictLeg[]): ConflictResult {
  const keys = new Set<string>();
  const pairs: ConflictPair[] = [];

  for (let i = 0; i < legs.length; i++) {
    for (let j = i + 1; j < legs.length; j++) {
      const kind = conflictBetween(legs[i], legs[j]);
      if (!kind) continue;
      pairs.push({ a: legs[i], b: legs[j], kind });
      keys.add(legs[i].key);
      keys.add(legs[j].key);
    }
  }

  return { keys, pairs };
}
