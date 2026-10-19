import { calcProfit, calcParlayOdds, calcParlayPayout } from "../lib/payout";

// PUSH matters: whole-number spreads and totals can land exactly on the line.
export type Grade = "WIN" | "LOSS" | "PUSH";

/** Over/under against a line - the shape every player prop settles on. */
export function gradeOverUnder(result: number, line: number, direction: "OVER" | "UNDER" | string): Grade {
  if (result === line) return "PUSH";
  const wentOver = result > line;
  return (direction === "OVER") === wentOver ? "WIN" : "LOSS";
}

// `line` is the bettor's line (their alt, if they took one). Returns null when
// the market can't be graded; callers treat that as unsettled, not a loss.
export function gradeGameLine(
  market: string,
  line: number | null,
  homeScore: number,
  awayScore: number,
): Grade | null {
  const cmp = (a: number, b: number): Grade => (a === b ? "PUSH" : a > b ? "WIN" : "LOSS");

  switch (market) {
    case "MONEYLINE_HOME": return cmp(homeScore, awayScore);
    case "MONEYLINE_AWAY": return cmp(awayScore, homeScore);
    default: break;
  }
  if (line == null) return null;

  if (market === "SPREAD_HOME" || market.startsWith("ALT_SPREAD_HOME")) return cmp(homeScore + line, awayScore);
  if (market === "SPREAD_AWAY" || market.startsWith("ALT_SPREAD_AWAY")) return cmp(awayScore + line, homeScore);

  const total = homeScore + awayScore;
  if (market === "TOTAL_OVER"  || market.startsWith("ALT_TOTAL_OVER"))  return cmp(total, line);
  if (market === "TOTAL_UNDER" || market.startsWith("ALT_TOTAL_UNDER")) return cmp(line, total);

  return null;
}

// Stake was taken at placement: WIN returns stake + profit, PUSH the stake, LOSS nothing.
export function creditFor(grade: Grade, stake: number, odds: number): number {
  if (grade === "WIN") return stake + calcProfit(stake, odds);
  if (grade === "PUSH") return stake;
  return 0;
}

export interface ParlayLegLike { outcome: string; odds: number }

// Pushed legs are dropped and the parlay re-priced on the rest.
export function settleParlay(
  legs: ParlayLegLike[],
  stake: number,
): { outcome: "PENDING" | "WIN" | "LOSS" | "VOID"; totalOdds: number | null; payout: number } | null {
  if (legs.length === 0) return null;

  // LOSS is checked before VOID so a scratched player can't refund a ticket
  // that has already lost. A void on a live ticket refunds the whole stake.
  if (legs.some((l) => l.outcome === "LOSS")) return { outcome: "LOSS", totalOdds: null, payout: 0 };
  if (legs.some((l) => l.outcome === "VOID")) return { outcome: "VOID", totalOdds: null, payout: stake };
  if (legs.some((l) => l.outcome === "PENDING")) return null;

  const surviving = legs.filter((l) => l.outcome === "WIN");
  if (surviving.length === 0) {
    // Every leg pushed - the wager never really happened.
    return { outcome: "VOID", totalOdds: null, payout: stake };
  }

  const totalOdds = calcParlayOdds(surviving.map((l) => l.odds));
  return { outcome: "WIN", totalOdds, payout: calcParlayPayout(stake, totalOdds) };
}
