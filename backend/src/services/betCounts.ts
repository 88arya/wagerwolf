import { sql, eq } from "drizzle-orm";
import { db } from "../db/db";
import { games } from "../db/schema";

/**
 * How many bets are riding on each game, across every league.
 *
 * Feeds the counter in the top right of the games-strip cards. Platform-wide
 * and not league-scoped, deliberately: the strip runs on the landing page for
 * signed-out visitors, where there is no league to scope to.
 *
 * WHAT COUNTS AS ONE BET
 *
 * A Pick is one. A GamePick is one. A Parlay is one *however many legs it has
 * on the game* — hence COUNT(DISTINCT "parlayId") rather than a row count.
 * Without that, one person's five-leg same-game parlay reads as five people
 * betting the game, which is the opposite of what the number is for.
 *
 * A parlay spanning two games counts once against each. That is intended: the
 * question each card answers is "how many wagers have something riding on this
 * game", not "how many wagers are exclusively about it".
 *
 * CASHED-OUT BETS ARE EXCLUDED
 *
 * Cashing out sets outcome VOID and refunds the stake in full, so the wager is
 * no longer on the game in any sense. The count is what is standing, not what
 * was ever placed.
 *
 * That makes the number able to fall before kickoff, which is correct — someone
 * pulled their bet. It cannot move afterwards: placement locks server-side at
 * `game.gameDate <= now`, and cashout is refused once a game has started
 * ("Cannot cash out after game has started"), so a live or final card's count
 * is frozen. Nothing here needs to poll for that reason.
 *
 * Settled bets keep counting. A final game showing 6 means six wagers were
 * riding on it, which is the same claim the card made while it was live.
 */
export async function betCountsForGames(gameIds: string[]): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (gameIds.length === 0) return counts;

  // Drizzle expands a JS array into a tuple of placeholders — `($1, $2, ...)` —
  // which is an IN list, not an array, so `= ANY(${'${gameIds}'})` is a syntax error.
  // Build the list explicitly and use IN.
  const ids = sql.join(gameIds.map((id) => sql`${id}`), sql`, `);

  // One round trip. The three sources are summed in SQL rather than merged in
  // JS so this stays O(1) queries as markets are added.
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

/**
 * Stamps `betCount` onto each game of a week, in place.
 *
 * Every game gets the key, zero included — a missing field and a real zero are
 * different things to a client, and the strip decides for itself that zero
 * renders as nothing.
 */
export async function attachBetCounts(week: any): Promise<void> {
  const games: any[] = week?.games ?? [];
  if (games.length === 0) return;
  const counts = await betCountsForGames(games.map((g) => g.id));
  for (const g of games) g.betCount = counts.get(g.id) ?? 0;
}

/**
 * Cache in front of the per-week lookup, keyed by week id.
 *
 * The endpoint this backs is unauthenticated and the strip is on every route,
 * so a busy moment is every visitor polling the same week at once. The TTL
 * collapses that to a fixed handful of queries a minute no matter how many
 * people are watching — which is the only property a background worker would
 * have bought here, without the staleness or the extra moving parts.
 *
 * 15s against a 30s client poll: short enough that it never doubles the delay a
 * user actually perceives, long enough to flatten a crowd.
 *
 * Per-process and in-memory on purpose. It holds one small object per week and
 * needs no invalidation — the TTL is the whole policy — so Redis would be a
 * dependency for nothing. Several backend replicas each keeping their own copy
 * is fine: the worst case is one extra query per replica per TTL, and a stale
 * read is at most 15s behind a number that changes a few times an hour.
 */
const CACHE_TTL_MS = 15_000;
const cache = new Map<string, { at: number; data: Record<string, number> }>();

export async function betCountsForWeek(weekId: string): Promise<Record<string, number>> {
  const now = Date.now();
  const hit = cache.get(weekId);
  if (hit && now - hit.at < CACHE_TTL_MS) return hit.data;

  const rows = await db.select({ id: games.id }).from(games).where(eq(games.weekId, weekId));
  const counts = await betCountsForGames(rows.map((r) => r.id));

  // Every game of the week gets a key, zero included, so the client can tell
  // "no bets" from "this game was not in the response".
  const data: Record<string, number> = {};
  for (const r of rows) data[r.id] = counts.get(r.id) ?? 0;

  cache.set(weekId, { at: now, data });
  return data;
}
