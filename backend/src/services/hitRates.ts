import { sql } from "drizzle-orm";
import { db } from "../db/db";

export type HitRates = Record<string, { overPct: number; sampleSize: number }>;

/**
 * Historical over/under rate per player and stat, keyed `playerId:statType`.
 *
 * COUNTED IN POSTGRES. This used to select every graded prop there has ever
 * been and count them in JavaScript, on every bet-page load. That is a table
 * that only grows: 0.42 MB out of Supabase per request by week 4 (measured
 * 3 Oct 2026), heading for several MB by week 17, against a 5 GB monthly egress
 * cap. GROUP BY sends one row per player and stat instead.
 *
 * A result exactly on the line counts as neither, as before: `>` and `<`, never
 * `>=`.
 *
 * CACHED FOR AN HOUR, in this process. The numbers only move when a game is
 * graded, which happens after it has finished, and a bettor is looking at next
 * games' props by then. An hour of lag on a season-long percentage is
 * invisible; a fresh read per page load was not.
 */
const TTL_MS = 60 * 60_000;
let cached: { at: number; rates: HitRates } | null = null;
let inflight: Promise<HitRates> | null = null;

async function compute(): Promise<HitRates> {
  const res: any = await db.execute(sql`
    SELECT "playerId", "statType",
           COUNT(*) FILTER (WHERE "result" > "line")::int AS over,
           COUNT(*) FILTER (WHERE "result" < "line")::int AS under
      FROM "Prop"
     WHERE "result" IS NOT NULL
     GROUP BY "playerId", "statType"
  `);
  const rows: any[] = res.rows ?? res;
  const rates: HitRates = {};
  for (const r of rows) {
    const total = r.over + r.under;
    if (total === 0) continue;
    rates[`${r.playerId}:${r.statType}`] = { overPct: Math.round((r.over / total) * 100), sampleSize: total };
  }
  return rates;
}

export async function hitRates(): Promise<HitRates> {
  if (cached && Date.now() - cached.at <= TTL_MS) return cached.rates;
  // One read shared by every request that arrives while it runs.
  inflight ??= compute()
    .then((rates) => { cached = { at: Date.now(), rates }; return rates; })
    .finally(() => { inflight = null; });
  return inflight;
}
