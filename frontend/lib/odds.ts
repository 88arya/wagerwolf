export function fmtOdds(american: number): string {
  return american > 0 ? `+${american}` : `${american}`;
}

export function toDecimal(american: number): number {
  if (american > 0) return american / 100 + 1;
  return 100 / Math.abs(american) + 1;
}

// Profit on a winning stake, in cents.
export function calcProfit(stake: number, odds: number): number {
  if (odds > 0) return Math.round((stake * odds) / 100);
  return Math.round((stake * 100) / Math.abs(odds));
}
