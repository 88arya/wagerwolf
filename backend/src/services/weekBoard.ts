import { asc, inArray } from "drizzle-orm";
import { db } from "../db/db";
import { props, gameLines } from "../db/schema";

// Per-game in-memory cache of props and lines for the bet board. The payload is
// large and only changes when the poller or settlement writes, and those run in
// this process and invalidate here. Generations stop a rebuild that started
// before a write from storing stale data. Needs Redis with a second replica.

export type GameMarkets = { props: any[]; gameLines: any[] };

const TTL_MS = 6 * 60 * 60_000;

const entries = new Map<string, { markets: GameMarkets; at: number }>();
const inflight = new Map<string, Promise<Map<string, GameMarkets>>>();
const gameGen = new Map<string, number>();
let globalGen = 0;

const genOf = (gameId: string) => `${globalGen}:${gameGen.get(gameId) ?? 0}`;

let version = 0;
export const marketsVersion = () => version;
const EMPTY: GameMarkets = { props: [], gameLines: [] };

/** Drop one game's cached markets. Call AFTER the write it follows. */
export function invalidateGameMarkets(gameId: string): void {
  gameGen.set(gameId, (gameGen.get(gameId) ?? 0) + 1);
  entries.delete(gameId);
  version++;
}

/** Drop everything - for bulk writes that span games or weeks. */
export function invalidateAllMarkets(): void {
  globalGen++;
  entries.clear();
  version++;
}

async function load(gameIds: string[]): Promise<Map<string, GameMarkets>> {
  // No `available` filter: bets on pulled markets still need to resolve.
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

// Misses are read in one shared query. Returned arrays are shared; don't mutate.
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
