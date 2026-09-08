// All money in this app is stored and sent over the API as an integer number of CENTS.
// Format for display and parse user input through these helpers — never divide/round inline.

/** Format integer cents as a number with 2 decimals + separators, no sign or $: 123450 -> "1,234.50". */
export function fmtAmount(cents: number | null | undefined): string {
  const abs = Math.abs(Math.round(Number(cents ?? 0)));
  return (abs / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Format integer cents as a dollar string, always 2 decimals: 123450 -> "$1,234.50". */
export function fmtMoney(cents: number | null | undefined, opts?: { sign?: boolean }): string {
  const c = Math.round(Number(cents ?? 0));
  const sign = c < 0 ? "-" : opts?.sign ? "+" : "";
  return `${sign}$${fmtAmount(c)}`;
}

/**
 * Whole dollars, no cents: 123450 -> "$1,235". For stat cards and headline
 * figures, where ".00" on every number is noise and two significant cents never
 * change the reading. NEVER for a balance, a stake or anything a user reconciles
 * against their own money — those are exact, and fmtMoney is the one for them.
 */
export function fmtDollars(cents: number | null | undefined): string {
  const c = Math.round(Number(cents ?? 0));
  const sign = c < 0 ? "-" : "";
  return `${sign}$${Math.round(Math.abs(c) / 100).toLocaleString()}`;
}

/** Parse a user-entered dollar amount ("12.50", "12", 12.5) into integer cents. */
export function toCents(input: string | number | null | undefined): number {
  const n = typeof input === "number" ? input : parseFloat(String(input ?? ""));
  if (!isFinite(n)) return 0;
  return Math.round(n * 100);
}

/** Convert integer cents to a dollar number (for prefilling number inputs): 1250 -> 12.5. */
export function toDollars(cents: number | null | undefined): number {
  return Math.round(Number(cents ?? 0)) / 100;
}
