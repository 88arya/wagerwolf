import { sql, eq } from "drizzle-orm";
import { db } from "../db/db";
import { games } from "../db/schema";

// Standing bets per game across all leagues. A parlay counts once per game;
// cashed-out bets are excluded.
export async function betCountsForGames(gameIds: string[]): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (gameIds.length === 0) return counts;

  // Drizzle expands an array into a tuple, so build an IN list.
  const ids = sql.join(gameIds.map((id) => sql`${id}`), sql`, `);

  const rows: any = await db.execute(sql`
    SELECT "gameId", SUM(c)::int AS count FROM (
      SELECT p."gameId" AS "gameId", COUNT(*)::int AS c
        FROM "Pick" pk
        JOIN "Prop" p ON p.id = pk."propId"
       WHERE p."gameId" IN (${ids}) AND pk."cashedOut" = false
       GROUP BY p."gameId"

      UNION ALL

      SELECT gl."gameId" AS "gameId", COUNT(*)::int AS c
        FROM "GamePick" gp
        JOIN "GameLine" gl ON gl.id = gp."gameLineId"
       WHERE gl."gameId" IN (${ids}) AND gp."cashedOut" = false
       GROUP BY gl."gameId"

      UNION ALL

      -- A leg points at a prop OR a game line, never both, so COALESCE picks
      -- whichever side resolved. DISTINCT collapses multi-leg same-game
      -- parlays to the one wager they are.
      SELECT legs."gameId" AS "gameId", COUNT(DISTINCT legs."parlayId")::int AS c
        FROM (
          SELECT pl."parlayId", COALESCE(p."gameId", gl."gameId") AS "gameId"
            FROM "ParlayLeg" pl
            JOIN "Parlay" pa ON pa.id = pl."parlayId" AND pa."cashedOut" = false
            LEFT JOIN "Prop" p ON p.id = pl."propId"
            LEFT JOIN "GameLine" gl ON gl.id = pl."gameLineId"
        ) legs
       WHERE legs."gameId" IN (${ids})
       GROUP BY legs."gameId"
    ) t
    GROUP BY "gameId"
  `);

  // node-postgres returns { rows }, some drivers return the array directly.
  const list: any[] = Array.isArray(rows) ? rows : (rows?.rows ?? []);
  for (const r of list) counts.set(r.gameId, Number(r.count) || 0);
  return counts;
}

export async function attachBetCounts(week: any): Promise<void> {
  const games: any[] = week?.games ?? [];
  if (games.length === 0) return;
  const counts = await betCountsForGames(games.map((g) => g.id));
  for (const g of games) g.betCount = counts.get(g.id) ?? 0;
}

// Public endpoint polled every 30s by every visitor; a short TTL flattens that.
const CACHE_TTL_MS = 15_000;
const cache = new Map<string, { at: number; data: Record<string, number> }>();

export async function betCountsForWeek(weekId: string): Promise<Record<string, number>> {
  const now = Date.now();
  const hit = cache.get(weekId);
  if (hit && now - hit.at < CACHE_TTL_MS) return hit.data;

  const rows = await db.select({ id: games.id }).from(games).where(eq(games.weekId, weekId));
  const counts = await betCountsForGames(rows.map((r) => r.id));

  const data: Record<string, number> = {};
  for (const r of rows) data[r.id] = counts.get(r.id) ?? 0;

  cache.set(weekId, { at: now, data });
  return data;
}
