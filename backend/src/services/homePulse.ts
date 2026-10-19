import { sql, eq, desc, type SQL } from "drizzle-orm";
import { db } from "../db/db";
import { weeks } from "../db/schema";
import { currentWeek } from "./currentWeek";

// Platform-wide numbers for /home: this week's most-bet entities and last
// week's results. A parlay counts once per entity it touches. A winning parlay
// credits its profit to every entity on it; a loss is charged only to entities
// whose own leg lost.

/** American odds -> profit on a winning stake, in whole cents. Mirrors lib/payout's calcProfit. */
const PROFIT_SQL = sql`CASE WHEN odds > 0
                            THEN ROUND(stake * odds / 100.0)
                            ELSE ROUND(stake * 100.0 / ABS(odds)) END`;

function legsFor(weekId: string) {
  return sql`
    SELECT 'PICK' AS kind, pk.id AS ticket, pk.stake AS stake, pk.odds AS odds,
           pk.outcome AS ticket_outcome, pk.outcome AS leg_outcome,
           NULL::int AS payout, pk."createdAt" AS created,
           pr."playerId" AS player_id, pr."gameId" AS game_id,
           NULL::text AS market, g."homeTeam" AS home, g."awayTeam" AS away
      FROM "Pick" pk
      JOIN "Prop" pr ON pr.id = pk."propId"
      JOIN "Game" g ON g.id = pr."gameId"
     WHERE g."weekId" = ${weekId} AND pk."cashedOut" = false

    UNION ALL

    SELECT 'GAMEPICK', gp.id, gp.stake, gp.odds,
           gp.outcome, gp.outcome,
           NULL::int, gp."createdAt",
           NULL::text, gl."gameId",
           gl.market, g."homeTeam", g."awayTeam"
      FROM "GamePick" gp
      JOIN "GameLine" gl ON gl.id = gp."gameLineId"
      JOIN "Game" g ON g.id = gl."gameId"
     WHERE g."weekId" = ${weekId} AND gp."cashedOut" = false

    UNION ALL

    -- A leg points at a prop OR a game line, never both, so COALESCE picks
    -- whichever side resolved. The parlay's stake and odds ride on every one of
    -- its legs; DISTINCT downstream is what stops that becoming double-counting.
    SELECT 'PARLAY', pa.id, pa.stake, pa."totalOdds",
           pa.outcome, pl.outcome,
           pa.payout, pa."createdAt",
           pr."playerId", COALESCE(pr."gameId", gl."gameId"),
           gl.market, g."homeTeam", g."awayTeam"
      FROM "ParlayLeg" pl
      JOIN "Parlay" pa ON pa.id = pl."parlayId" AND pa."cashedOut" = false
      LEFT JOIN "Prop" pr ON pr.id = pl."propId"
      LEFT JOIN "GameLine" gl ON gl.id = pl."gameLineId"
      JOIN "Game" g ON g.id = COALESCE(pr."gameId", gl."gameId")
     WHERE g."weekId" = ${weekId}
  `;
}

const TEAM_KEY = sql`CASE
    WHEN market = 'MONEYLINE_HOME' OR market = 'SPREAD_HOME' OR market LIKE 'ALT_SPREAD_HOME%' THEN home
    WHEN market = 'MONEYLINE_AWAY' OR market = 'SPREAD_AWAY' OR market LIKE 'ALT_SPREAD_AWAY%' THEN away
    ELSE NULL END`;

type Executor = { execute: (q: SQL) => Promise<any> };

function rowsOf(result: any): any[] {
  return Array.isArray(result) ? result : (result?.rows ?? []);
}

export type VolumeRow = {
  key: string;
  bets: number;
  wagered: number;
  label: string;
  sublabel: string | null;
  imageUrl?: string | null;
  /** Game rows only: the two teams, so the client can draw both crests. */
  away?: string | null;
  home?: string | null;
};

// Ties go to whoever reached the count first.
const NO_TIES = sql`ORDER BY bets DESC, last_bet ASC`;

export async function volumeForWeek(exec: Executor, weekId: string, limit: number) {
  const legs = legsFor(weekId);

  const players = await exec.execute(sql`
    WITH legs AS (${legs})
    SELECT d.player_id AS key, COUNT(*)::int AS bets, SUM(d.stake)::bigint AS wagered,
           MAX(d.created) AS last_bet,
           p.name AS label, p.team || ' · ' || p.position AS sublabel, p."imageUrl" AS "imageUrl"
      FROM (SELECT DISTINCT player_id, kind, ticket, stake, created FROM legs WHERE player_id IS NOT NULL) d
      JOIN "Player" p ON p.id = d.player_id
     GROUP BY d.player_id, p.name, p.team, p.position, p."imageUrl"
     ${NO_TIES}
     LIMIT ${limit}
  `);

  const teams = await exec.execute(sql`
    WITH legs AS (${legs}),
         keyed AS (SELECT ${TEAM_KEY} AS team_key, kind, ticket, stake, created FROM legs)
    SELECT d.team_key AS key, COUNT(*)::int AS bets, SUM(d.stake)::bigint AS wagered,
           MAX(d.created) AS last_bet,
           d.team_key AS label, NULL::text AS sublabel
      FROM (SELECT DISTINCT team_key, kind, ticket, stake, created FROM keyed WHERE team_key IS NOT NULL) d
     GROUP BY d.team_key
     ${NO_TIES}
     LIMIT ${limit}
  `);

  const gamesRows = await exec.execute(sql`
    WITH legs AS (${legs})
    SELECT d.game_id AS key, COUNT(*)::int AS bets, SUM(d.stake)::bigint AS wagered,
           MAX(d.created) AS last_bet,
           g."awayTeam" || ' @ ' || g."homeTeam" AS label,
           g.status AS sublabel,
           -- Sent separately as well as inside the label. The client draws a
           -- crest for each, and splitting the label back apart on " @ " would
           -- couple its rendering to a string this query happens to build.
           g."awayTeam" AS away, g."homeTeam" AS home
      FROM (SELECT DISTINCT game_id, kind, ticket, stake, created FROM legs WHERE game_id IS NOT NULL) d
      JOIN "Game" g ON g.id = d.game_id
     GROUP BY d.game_id, g."awayTeam", g."homeTeam", g.status, g."gameDate"
     ${NO_TIES}
     LIMIT ${limit}
  `);

  const norm = (r: any): VolumeRow => ({
    key: r.key,
    bets: Number(r.bets) || 0,
    wagered: Number(r.wagered) || 0,
    label: r.label,
    sublabel: r.sublabel ?? null,
    imageUrl: r.imageUrl ?? null,
    away: r.away ?? null,
    home: r.home ?? null,
  });

  return {
    players: rowsOf(players).map(norm),
    teams: rowsOf(teams).map(norm),
    games: rowsOf(gamesRows).map(norm),
  };
}

export type LedgerRow = VolumeRow & { profit: number; lost: number; net: number };

export async function ledgerForWeek(exec: Executor, weekId: string, limit: number) {
  const legs = legsFor(weekId);

  const amounts = sql`
    SELECT DISTINCT ON (entity, kind, ticket)
           entity, kind, ticket, stake, created,
           CASE WHEN ticket_outcome = 'WIN' AND kind = 'PARLAY' THEN payout - stake
                WHEN ticket_outcome = 'WIN'                     THEN ${PROFIT_SQL}
                ELSE 0 END AS profit,
           CASE WHEN ticket_outcome = 'LOSS' AND kind = 'PARLAY'
                     THEN CASE WHEN leg_outcome = 'LOSS' THEN stake ELSE 0 END
                WHEN ticket_outcome = 'LOSS'             THEN stake
                ELSE 0 END AS lost
      FROM scoped
     ORDER BY entity, kind, ticket, (CASE WHEN leg_outcome = 'LOSS' THEN 1 ELSE 0 END) DESC
  `;

  const players = await exec.execute(sql`
    WITH legs AS (${legs}),
         scoped AS (SELECT player_id AS entity, * FROM legs WHERE player_id IS NOT NULL),
         amounts AS (${amounts})
    SELECT a.entity AS key, COUNT(*)::int AS bets, SUM(a.stake)::bigint AS wagered,
           SUM(a.profit)::bigint AS profit, SUM(a.lost)::bigint AS lost,
           (SUM(a.profit) - SUM(a.lost))::bigint AS net,
           MAX(a.created) AS last_bet,
           p.name AS label, p.team || ' · ' || p.position AS sublabel, p."imageUrl" AS "imageUrl"
      FROM amounts a
      JOIN "Player" p ON p.id = a.entity
     GROUP BY a.entity, p.name, p.team, p.position, p."imageUrl"
  `);

  const teams = await exec.execute(sql`
    WITH legs AS (${legs}),
         scoped AS (SELECT ${TEAM_KEY} AS entity, * FROM legs),
         amounts AS (SELECT * FROM (${amounts}) x WHERE entity IS NOT NULL)
    SELECT a.entity AS key, COUNT(*)::int AS bets, SUM(a.stake)::bigint AS wagered,
           SUM(a.profit)::bigint AS profit, SUM(a.lost)::bigint AS lost,
           (SUM(a.profit) - SUM(a.lost))::bigint AS net,
           MAX(a.created) AS last_bet,
           a.entity AS label, NULL::text AS sublabel
      FROM amounts a
     GROUP BY a.entity
  `);

  const norm = (r: any): LedgerRow & { lastBet: number } => ({
    lastBet: r.last_bet ? new Date(r.last_bet).getTime() : 0,
    key: r.key,
    bets: Number(r.bets) || 0,
    wagered: Number(r.wagered) || 0,
    profit: Number(r.profit) || 0,
    lost: Number(r.lost) || 0,
    net: Number(r.net) || 0,
    label: r.label,
    sublabel: r.sublabel ?? null,
    imageUrl: r.imageUrl ?? null,
  });

  const playerRows = rowsOf(players).map(norm);
  const teamRows = rowsOf(teams).map(norm);

  const first = (a: { lastBet: number }, b: { lastBet: number }) => a.lastBet - b.lastBet;
  const byBets = (a: any, b: any) => b.bets - a.bets || first(a, b);

  return {
    teamsHit: teamRows.filter((t) => t.net > 0).sort(byBets).slice(0, limit),
    teamsMiss: teamRows.filter((t) => t.net < 0).sort(byBets).slice(0, limit),
    playersProfit: playerRows.filter((p) => p.profit > 0)
      .sort((a, b) => b.profit - a.profit || first(a, b)).slice(0, limit),
    playersLost: playerRows.filter((p) => p.lost > 0)
      .sort((a, b) => b.lost - a.lost || first(a, b)).slice(0, limit),
  };
}

export type Pulse = Awaited<ReturnType<typeof buildPulse>>;

async function buildPulse(limit: number) {
  // Last week = most recently resolved week, not current - 1.
  const now = new Date();
  const current = await currentWeek(now);

  const last = await db.query.weeks.findFirst({
    where: eq(weeks.resolved, true),
    orderBy: desc(weeks.number),
  });

  return {
    current: current
      ? { week: current.number, ...(await volumeForWeek(db, current.id, limit)) }
      : null,
    last: last
      ? { week: last.number, ...(await ledgerForWeek(db, last.id, limit)) }
      : null,
  };
}

// Per-process TTL cache; numbers only move when bets are placed.
const CACHE_TTL_MS = 60_000;

// Caches the in-flight promise so concurrent misses share one query.
let cache: { at: number; limit: number; data: Promise<Pulse> } | null = null;

export async function homePulse(limit = 5): Promise<Pulse> {
  const now = Date.now();
  if (cache && cache.limit === limit && now - cache.at < CACHE_TTL_MS) return cache.data;

  const entry = { at: now, limit, data: buildPulse(limit) };
  cache = entry;
  entry.data.catch(() => { if (cache === entry) cache = null; });
  return entry.data;
}
