import { calcProfit, calcParlayOdds, calcParlayPayout } from "../lib/payout";

/**
 * How a settled wager finished.
 *
 * PUSH is new and load-bearing. The old comparison was
 *
 *   won = (OVER && result > line) || (UNDER && result < line)
 *
 * which makes an exact tie `false` on *both* sides, so a result landing on the
 * number graded as a loss for everyone holding it. Half-point lines hide this
 * most of the time, but whole-number spreads and totals are ordinary, and an
 * NFL game really can end level.
 */
export type Grade = "WIN" | "LOSS" | "PUSH";

/** Over/under against a line — the shape every player prop settles on. */
export function gradeOverUnder(result: number, line: number, direction: "OVER" | "UNDER" | string): Grade {
  if (result === line) return "PUSH";
  const wentOver = result > line;
  return (direction === "OVER") === wentOver ? "WIN" : "LOSS";
}

/**
 * A game-line market against the final score.
 *
 * `line` is the bettor's line (their alt if they took one), not necessarily the
 * line stored on the market. Returns null when the market is unknown or the
 * line is missing, which the caller must treat as "not settled" rather than a
 * loss.
 */
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

/**
 * What to credit back for a settled single bet.
 *
 * The stake was already taken at placement, so a WIN returns stake + profit, a
 * PUSH returns the stake untouched, and a LOSS returns nothing.
 */
export function creditFor(grade: Grade, stake: number, odds: number): number {
  if (grade === "WIN") return stake + calcProfit(stake, odds);
  if (grade === "PUSH") return stake;
  return 0;
}

export interface ParlayLegLike { outcome: string; odds: number }

/**
 * Settle a parlay from its legs, the way a sportsbook does.
 *
 * A pushed leg is *removed* and the parlay re-priced on the survivors — it does
 * not lose the ticket, and it does not pay as if it had won. Every leg pushing
 * refunds the stake. `payout` already includes the stake, so a WIN credits it
 * whole.
 */
export function settleParlay(
  legs: ParlayLegLike[],
  stake: number,
): { outcome: "PENDING" | "WIN" | "LOSS" | "VOID"; totalOdds: number | null; payout: number } | null {
  if (legs.length === 0) return null;

  // ORDER MATTERS. A lost leg is checked first, and it blocks the refund.
  //
  // A voided leg refunds the whole ticket — but only while the ticket is still
  // alive. The stake was struck against combined odds that included the dead
  // leg, so the survivors were never priced to stand on their own; and a player
  // ruled out on Monday night leaves no week left to re-bet in, while balance
  // *is* the weekly score. But once something has already lost, the ticket was
  // dead on its own merits and a late scratch must not resurrect it.
  //
  // Checking LOSS first is what stops a questionable player being free-roll
  // insurance on the rest of the ticket. In practice a losing leg already
  // settles the parlay immediately, so a still-PENDING parlay has not lost
  // anything — this ordering just makes that hold even when several games are
  // graded in one pass.
  //
  // Pending legs do NOT block a refund: "still in progress" counts as alive.
  if (legs.some((l) => l.outcome === "LOSS")) return { outcome: "LOSS", totalOdds: null, payout: 0 };
  if (legs.some((l) => l.outcome === "VOID")) return { outcome: "VOID", totalOdds: null, payout: stake };
  if (legs.some((l) => l.outcome === "PENDING")) return null;

  const surviving = legs.filter((l) => l.outcome === "WIN");
  if (surviving.length === 0) {
    // Every leg pushed — the wager never really happened.
    return { outcome: "VOID", totalOdds: null, payout: stake };
  }

  const totalOdds = calcParlayOdds(surviving.map((l) => l.odds));
  return { outcome: "WIN", totalOdds, payout: calcParlayPayout(stake, totalOdds) };
}
