// Alt-line ladders for player props. Uses the book's ladder when the prop has
// one; otherwise lines step around the main line and odds move linearly.

import type { Direction, Prop } from "@/lib/types";

const PROP_OFFSETS = [-2, -1, 0, 1, 2];

const YARD_TYPES = [
  "PASSING_YARDS", "RUSHING_YARDS", "RECEIVING_YARDS",
  "PASSING_LONGEST", "RUSHING_LONGEST", "RECEIVING_LONGEST", "FIELD_GOAL_LONGEST",
];

function propStep(statType: string): number {
  if (YARD_TYPES.includes(statType)) return 5;
  if (statType === "KICKING_POINTS") return 1;
  return 0.5;
}

function stepLine(baseLine: number, offset: number, step: number): number {
  return Math.round((baseLine + offset * step) * 100) / 100;
}

function linearOdds(baseOdds: number, baseLine: number, altLine: number, statType: string, direction: Direction): number {
  const steps = (altLine - baseLine) / propStep(statType);
  const favSteps = direction === "OVER" ? -steps : steps;
  return Math.max(-500, Math.min(500, baseOdds - Math.round(favSteps * 15)));
}

export function propLadderLines(prop: Prop): number[] {
  if (prop.altLadder?.length) return prop.altLadder.map((r) => r.line);
  const step = propStep(prop.statType);
  return PROP_OFFSETS
    .map((o) => stepLine(prop.line, o, step))
    .filter((l) => l > 0);
}

export function propLadderOdds(prop: Prop, line: number, direction: Direction): number {
  const rung = prop.altLadder?.find((r) => Math.abs(r.line - line) < 0.001);
  if (rung) return direction === "OVER" ? rung.over : rung.under;
  return linearOdds(prop.odds ?? -110, prop.line, line, prop.statType, direction);
}

// Index of the ladder line whose Over odds are closest to even money (+100).
export function closestToEvenIdx(prop: Prop): number {
  let bestIdx = 0;
  let bestDist = Infinity;
  propLadderLines(prop).forEach((line, idx) => {
    const dist = Math.abs(propLadderOdds(prop, line, "OVER") - 100);
    if (dist < bestDist) { bestDist = dist; bestIdx = idx; }
  });
  return bestIdx;
}

export function closestToEvenLine(prop: Prop): number {
  return propLadderLines(prop)[closestToEvenIdx(prop)] ?? prop.line;
}
