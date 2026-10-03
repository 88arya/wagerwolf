import { asc, inArray } from "drizzle-orm";
import { db } from "../db/db";
import { props, gameLines } from "../db/schema";

/**
 * The bet board's markets, cached per game in this process.
 *
 * WHY THIS EXISTS. `GET /weeks?current=true` carries every prop (with its alt
 * ladder and an embedded player row) and every game line for the week: 1,460
 * props and 3,458 lines on week 4, 1.86 MB of JSON. It was rebuilt from
 * Postgres on every request, and measured on 3 Oct 2026 each rebuild pulled
 * ~1.42 MB from Supabase. Supabase's free tier caps egress at 5 GB a month, so
 * the board alone capped the whole product at roughly 3,500 page loads a month.
 *
 * The markets change only when something writes them — the odds poller, the
 * settlement pass, a manual resolve — and all of those run in this process, so
 * they invalidate here instead of every reader re-reading. Game rows (score,
 * status) are NOT cached: they move every minute during play, and the route
 * reads them fresh, which is 16 small rows.
 *
 * PER GAME, not per week, because the poller refreshes one game at a time. A
 * whole-week key would re-read all 1.4 MB every time any one game's prices
 * moved; per game it re-reads ~90 KB.
 *
 * GENERATIONS stop a race that a plain delete would leave open. A rebuild that
 * started before a write and finished after it would otherwise store the
 * pre-write markets with a fresh timestamp. Each rebuild records the generation
 * it started under and stores only if nothing invalidated the game meanwhile.
 * The response still uses what it read, which is exactly as fresh as an
 * uncached read would have been.
 *
 * SINGLE PROCESS. Invalidation is in memory, which is correct while the
 * scheduler's worker and the API share one process on one box. A second API
 * replica would need this moved to Redis, the same caveat as homePulse and
 * betCounts.
 *
 * THE TTL IS A BACKSTOP, not the mechanism. It covers writers that cannot reach
 * this module: scripts run as their own process, and the image route's lazy
 * player backfill (a player's position on the board can trail it by up to the
 * TTL; the avatar itself reads that route directly). Six hours keeps the
 * backstop's own cost to ~170 MB a month at constant traffic.
 */

export type GameMarkets = { props: any[]; gameLines: any[] };

const TTL_MS = 6 * 60 * 60_000;

const entries = new Map<string, { markets: GameMarkets; at: number }>();
const inflight = new Map<string, Promise<Map<string, GameMarkets>>>();
const gameGen = new Map<string, number>();
let globalGen = 0;

const genOf = (gameId: string) => `${globalGen}:${gameGen.get(gameId) ?? 0}`;
const EMPTY: GameMarkets = { props: [], gameLines: [] };

/** Drop one game's cached markets. Call AFTER the write it follows. */
export function invalidateGameMarkets(gameId: string): void {
  gameGen.set(gameId, (gameGen.get(gameId) ?? 0) + 1);
  entries.delete(gameId);
}

/** Drop everything — for bulk writes that span games or weeks. */
export function invalidateAllMarkets(): void {
  globalGen++;
  entries.clear();
}

async function load(gameIds: string[]): Promise<Map<string, GameMarkets>> {
  // The same projection the route used to nest: every prop with its player,
  // every line. No `available` filter, deliberately unchanged — My Bets and the
  // bet page's submitted ticks look bets up by these ids, and a bet on a pulled
  // market has to keep resolving.
  //
  // ORDERED, which the nested query never was. The bet page lays its market
  // cards out in the order stat types first appear, so the unordered read
  // showed Passing as Completions, Yards, Touchdowns on one game and Yards,
  // Touchdowns, Attempts on the next. `statType` is a Postgres enum, which
  // sorts by declaration order: Yards, Touchdowns, Completions, Attempts, as
  // schema.ts lists them. Players within a market are ranked client side.
  const [propRows, lineRows] = await Promise.all([
    db.query.props.findMany({
      where: inArray(props.gameId, gameIds),
      with: { player: true },
      orderBy: [asc(props.statType), asc(props.id)],
    }),
    db.query.gameLines.findMany({
      where: inArray(gameLines.gameId, gameIds),
      orderBy: [asc(gameLines.market), asc(gameLines.line), asc(gameLines.id)],
    }),
  ]);
  const byGame = new Map<string, GameMarkets>(gameIds.map((id) => [id, { props: [], gameLines: [] }]));
  for (const p of propRows) byGame.get(p.gameId)?.props.push(p);
  for (const l of lineRows) byGame.get(l.gameId)?.gameLines.push(l);
  return byGame;
}

function sweep(now: number): void {
  if (entries.size < 64) return;
  for (const [id, e] of entries) if (now - e.at > TTL_MS) entries.delete(id);
}

/**
 * Markets for each game, from cache where possible. Missing games are read in
 * ONE query, and concurrent callers share it: a burst of board loads after an
 * invalidation costs one read, not one per request.
 *
 * The returned arrays are shared between responses. Callers must not mutate
 * them.
 */
export async function marketsForGames(gameIds: string[]): Promise<Map<string, GameMarkets>> {
  const now = Date.now();
  sweep(now);
  const out = new Map<string, GameMarkets>();
  const missing: string[] = [];
  for (const id of gameIds) {
    const e = entries.get(id);
    if (e && now - e.at <= TTL_MS) out.set(id, e.markets);
    else missing.push(id);
  }
  if (missing.length === 0) return out;

  const toFetch = missing.filter((id) => !inflight.has(id));
  if (toFetch.length > 0) {
    const started = new Map(toFetch.map((id) => [id, genOf(id)]));
    const p = load(toFetch)
      .then((byGame) => {
        const at = Date.now();
        for (const id of toFetch) {
          if (genOf(id) === started.get(id)) entries.set(id, { markets: byGame.get(id) ?? EMPTY, at });
        }
        return byGame;
      })
      .finally(() => {
        for (const id of toFetch) if (inflight.get(id) === p) inflight.delete(id);
      });
    for (const id of toFetch) inflight.set(id, p);
  }

  // Captured synchronously, before any await, so `finally` cannot remove an
  // entry out from under us.
  const waits = missing.map((id) => [id, inflight.get(id)!] as const);
  await Promise.all(waits.map(async ([id, p]) => {
    out.set(id, (await p).get(id) ?? EMPTY);
  }));
  return out;
}

/** Test seam. */
export function _resetWeekBoardCache(): void {
  entries.clear();
  inflight.clear();
  gameGen.clear();
  globalGen = 0;
}
