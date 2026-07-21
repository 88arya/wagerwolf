// All money is integer cents. Format for user-facing messages: 12345 -> "$123.45".
export function fmtMoney(cents: number | null | undefined): string {
  const c = Math.round(Number(cents ?? 0));
  return `$${(c / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function toDecimal(american: number): number {
  if (american > 0) return american / 100 + 1;
  return 100 / Math.abs(american) + 1;
}

export function calcProfit(stake: number, american: number): number {
  if (american > 0) return Math.round((stake * american) / 100);
  return Math.round((stake * 100) / Math.abs(american));
}

export function calcParlayOdds(legs: number[]): number {
  const decimal = legs.reduce((acc, o) => acc * toDecimal(o), 1);
  if (decimal >= 2) return Math.round((decimal - 1) * 100);
  return Math.round(-100 / (decimal - 1));
}

export function calcParlayPayout(stake: number, totalOdds: number): number {
  return stake + calcProfit(stake, totalOdds);
}
