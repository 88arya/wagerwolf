import { sql } from "drizzle-orm";
import { db } from "../db/db";
import { currentWeekId } from "./currentWeek";

// Public sample of this week's board for the landing marquee: one prop per
// player, no ids or alt ladders, so it isn't usable for betting.
const MAX = 500;

export type PublicMarket =
  | {
      kind: "prop";
      player: string;
      team: string;
      position: string;
      /** ESPN headshot id. Never null - see the WHERE clause on propSample. */
      espnId: string;
      statType: string;
      line: number;
      odds: number;
      game: string;
    }
  | {
      kind: "team";
      team: string;
      /** "Moneyline" or "Spread", already display-ready. */
      market: string;
      /** The book's own label, e.g. "SEA -3.5" or "SEA ML". */
      label: string;
      odds: number;
      game: string;
    };

// Counts for the whole board, not the sample.
export type BoardTotals = {
  /** Every available GameLine on the week, ALT ladders included. */
  lines: number;
  /** Every available Prop on the week - all stat types, all players. */
  props: number;
};

export type PublicBoard = {
  markets: PublicMarket[];
  totals: BoardTotals;
};

function rowsOf(r: any): any[] {
  return Array.isArray(r) ? r : (r?.rows ?? []);
}

// Players with a headshot only, one prop each (DISTINCT ON).
async function propSample(weekId: string): Promise<PublicMarket[]> {
  const rows = await db.execute(sql`
    SELECT DISTINCT ON (p."playerId")
           pl.name AS player, pl.team AS team, pl.position AS position,
           pl."espnId" AS espn,
           p."statType"::text AS stat, p.line AS line, p.odds AS odds,
           g."awayTeam" || ' vs ' || g."homeTeam" AS game
      FROM "Prop" p
      JOIN "Player" pl ON pl.id = p."playerId"
      JOIN "Game" g ON g.id = p."gameId"
     WHERE g."weekId" = ${weekId}
       AND p.available = true
       AND pl."espnId" IS NOT NULL
     -- THE LINE NEAREST EVEN MONEY, one per player. It ordered by gameDate then
     -- statType, which is first-by-enum-declaration-order, so a quarterback
     -- always showed passing yards and the sample filled with longshots
     -- wherever a player first-declared market happened to be an anytime
     -- touchdown price.
     --
     -- ABS(ABS(odds) - 100) is the distance of the PRICE MAGNITUDE from 100, so
     -- -110 and +110 both score 10 and +1280 scores 1180. ABS(odds - 100) would
     -- rank +300 above -110, which is backwards: -110 is the ordinary line.
     -- (No backticks in this comment: it sits inside a JS template literal.)
     ORDER BY p."playerId", ABS(ABS(p.odds) - 100), g."gameDate"
  `);
  return rowsOf(rows).map((r) => ({
    kind: "prop" as const,
    player: r.player,
    team: r.team,
    position: r.position,
    espnId: String(r.espn),
    statType: String(r.stat).split("_").join(" ").toLowerCase(),
    line: Number(r.line),
    odds: Number(r.odds),
    game: r.game,
  }));
}

// Moneyline and spread only; totals have no team to show.
async function teamSample(weekId: string): Promise<PublicMarket[]> {
  const rows = await db.execute(sql`
    SELECT DISTINCT ON (g.id, gl.market)
           gl.market AS market, gl.label AS label, gl.odds AS odds,
           CASE WHEN gl.market LIKE '%_HOME' THEN g."homeTeam" ELSE g."awayTeam" END AS team,
           g."awayTeam" || ' vs ' || g."homeTeam" AS game
      FROM "GameLine" gl
      JOIN "Game" g ON g.id = gl."gameId"
     WHERE g."weekId" = ${weekId}
       AND gl.available = true
       AND gl.market IN ('MONEYLINE_HOME','MONEYLINE_AWAY','SPREAD_HOME','SPREAD_AWAY')
     ORDER BY g.id, gl.market, g."gameDate"
  `);
  // One market per game, rotating which, so the sample covers the whole slate.
  const byGame = new Map<string, any[]>();
  for (const r of rowsOf(rows)) {
    const list = byGame.get(r.game) ?? [];
    list.push(r);
    byGame.set(r.game, list);
  }

  return [...byGame.values()].map((markets, i) => {
    const r = markets[i % markets.length];
    return {
      kind: "team" as const,
      team: r.team,
      market: String(r.market).startsWith("MONEYLINE") ? "Moneyline" : "Spread",
      label: r.label,
      odds: Number(r.odds),
      game: r.game,
    };
  });
}

// No `available` filter here, so the count doesn't shrink through the week.
async function boardTotals(weekId: string): Promise<BoardTotals> {
  const rows = await db.execute(sql`
    SELECT
      (SELECT count(*) FROM "GameLine" l JOIN "Game" g ON g.id = l."gameId"
        WHERE g."weekId" = ${weekId})::int AS lines,
      (SELECT count(*) FROM "Prop" p JOIN "Game" g ON g.id = p."gameId"
        WHERE g."weekId" = ${weekId})::int AS props
  `);
  const r = rowsOf(rows)[0] ?? {};
  return { lines: Number(r.lines ?? 0), props: Number(r.props ?? 0) };
}

const TOTALS_REFRESH_MS = 5 * 60_000;

async function raiseTotals(weekId: string): Promise<BoardTotals | null> {
  const live = await boardTotals(weekId);
  const sum = live.lines + live.props;
  await db.execute(sql`
    UPDATE "Week"
       SET "publicBoard" = jsonb_set("publicBoard", '{totals}', ${JSON.stringify(live)}::jsonb)
     WHERE id = ${weekId}
       AND "publicBoard" IS NOT NULL
       AND COALESCE(("publicBoard"->'totals'->>'lines')::int, 0)
         + COALESCE(("publicBoard"->'totals'->>'props')::int, 0) < ${sum}
  `);
  const stored = rowsOf(await db.execute(sql`
    SELECT "publicBoard"->'totals' AS totals FROM "Week" WHERE id = ${weekId}
  `))[0]?.totals;
  return stored ? { lines: Number(stored.lines ?? 0), props: Number(stored.props ?? 0) } : null;
}

export async function publicMarketSample(weekId: string): Promise<PublicMarket[]> {
  const [props, teams] = await Promise.all([propSample(weekId), teamSample(weekId)]);
  return [...props, ...teams];
}

let memo: { weekId: string; board: PublicBoard; totalsCheckedAt: number } | null = null;

async function storedBoard(weekId: string): Promise<PublicBoard> {
  const existing = rowsOf(await db.execute(sql`
    SELECT "publicBoard" AS board FROM "Week" WHERE id = ${weekId}
  `))[0]?.board;
  if (existing?.markets) return existing as PublicBoard;

  const [markets, totals] = await Promise.all([
    publicMarketSample(weekId),
    boardTotals(weekId),
  ]);
  const board: PublicBoard = { markets, totals };

  if (markets.length === 0) return board;

  const written = rowsOf(await db.execute(sql`
    UPDATE "Week" SET "publicBoard" = ${JSON.stringify(board)}::jsonb
     WHERE id = ${weekId} AND "publicBoard" IS NULL
     RETURNING id
  `));
  if (written.length > 0) return board;

  // Someone else got there first. Theirs is the board of record.
  const winner = rowsOf(await db.execute(sql`
    SELECT "publicBoard" AS board FROM "Week" WHERE id = ${weekId}
  `))[0]?.board;
  return (winner as PublicBoard) ?? board;
}

export async function cachedPublicBoard(limit: number): Promise<PublicBoard> {
  const weekId = await currentWeekId();
  if (!weekId) return { markets: [], totals: { lines: 0, props: 0 } };

  if (!memo || memo.weekId !== weekId) {
    const board = await storedBoard(weekId);
    if (board.markets.length === 0) return board;
    memo = { weekId, board, totalsCheckedAt: 0 };
  }
  const m = memo;

  if (Date.now() - m.totalsCheckedAt >= TOTALS_REFRESH_MS) {
    m.totalsCheckedAt = Date.now();
    try {
      const totals = await raiseTotals(weekId);
      if (totals) m.board = { ...m.board, totals };
    } catch (err) {
      console.error("[publicMarkets] totals refresh failed:", err);
    }
  }
  const n = Math.min(Math.max(Math.trunc(limit) || 12, 1), MAX);
  return { markets: shuffle(m.board.markets).slice(0, n), totals: m.board.totals };
}

function shuffle<T>(input: readonly T[]): T[] {
  const a = [...input];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
