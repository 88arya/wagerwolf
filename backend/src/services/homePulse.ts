import { sql, eq, and, asc, desc, lte, gte, gt } from "drizzle-orm";
import { db } from "../db/db";
import { weeks } from "../db/schema";

/**
 * The numbers behind /home's two panels: what the platform is betting on this
 * week, and what it made or lost on last week.
 *
 * PLATFORM-WIDE, NOT LEAGUE-SCOPED. Every league's action is pooled, the same
 * way `betCounts.ts` pools the games-strip counters — and for the same reason:
 * the question "what is everyone on" has no league to scope to. Nothing here
 * names a user, so pooling leaks nothing a league boundary was protecting.
 *
 * WHAT COUNTS AS ONE BET — the rule is `betCounts.ts`'s, extended
 *
 * A Pick is one, a GamePick is one, and a Parlay is one *per entity it
 * touches*, however many legs it has on that entity. A two-leg parlay on two
 * Puka Nacua props is one wager on Nacua, not two, so it contributes its stake
 * once. That is what the DISTINCT over (entity, ticket) in every aggregate is
 * doing; without it a same-player parlay doubles both the count and the handle.
 *
 * A parlay spanning two entities counts once against each. Intended, and the
 * reason the money columns below do not sum to the week's total — see
 * ATTRIBUTION.
 *
 * Cashed-out wagers are excluded everywhere. Cashing out VOIDs the bet and
 * refunds it in full, so nothing is riding on the entity any more.
 *
 * THE THREE ENTITIES
 *
 * - **Player** — every market of theirs, any stat type, any direction. The unit
 *   is the person, not the line: "most bet on player" is a statement about
 *   Nacua, not about Nacua over 74.5 receiving yards.
 * - **Team** — their moneyline and spread only, alternates included. NOT their
 *   players' props, and NOT game totals, which belong to no team. A bet on the
 *   Bills is a bet on the Bills winning or covering.
 * - **Game** — everything attached to it: both teams' lines, the total, and
 *   every player prop in the fixture. So a game's numbers are always at least
 *   the sum of what its teams and players carry.
 *
 * The three deliberately nest. They answer different questions and are not
 * meant to reconcile.
 *
 * ATTRIBUTION, and why the money columns do not add up
 *
 * A winning parlay's whole profit is credited to *every* entity on the ticket.
 * A three-leg parlay that pays $60 credits $60 to each of its three players —
 * because each of them is a reason it won, and splitting it three ways would
 * understate what riding on that player was worth.
 *
 * Losses are the asymmetric half, and deliberately so. A parlay dies to one bad
 * leg, so a loss is charged **only to entities whose own leg graded LOSS**. A
 * player who cleared his line on a ticket that died elsewhere is not charged
 * for it. On the winning side there is no equivalent case to exclude: a parlay
 * only wins when every leg hit.
 *
 * Singles are unambiguous either way — profit on WIN, stake on LOSS.
 *
 * PUSH and VOID are excluded from both columns. Neither is a result.
 */

/** American odds → profit on a winning stake, in whole cents. Mirrors lib/payout's calcProfit. */
const PROFIT_SQL = sql`CASE WHEN odds > 0
                            THEN ROUND(stake * odds / 100.0)
                            ELSE ROUND(stake * 100.0 / ABS(odds)) END`;

/**
 * One row per (wager, market it touches) for a week, with the entity keys
 * already resolved.
 *
 * `leg_outcome` is the ticket's own outcome for a single and the *leg's*
 * outcome for a parlay — which is what makes the loss rule above expressible:
 * a parlay row carries both how the ticket finished and how this particular
 * entity's leg did.
 */
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

/**
 * Moneyline and spread resolve to the team they name; alternate spreads carry
 * the side in the market string (`ALT_SPREAD_HOME_-3.5`). Totals resolve to
 * NULL and drop out — an over is not a bet on either team.
 */
const TEAM_KEY = sql`CASE
    WHEN market = 'MONEYLINE_HOME' OR market = 'SPREAD_HOME' OR market LIKE 'ALT_SPREAD_HOME%' THEN home
    WHEN market = 'MONEYLINE_AWAY' OR market = 'SPREAD_AWAY' OR market LIKE 'ALT_SPREAD_AWAY%' THEN away
    ELSE NULL END`;

/**
 * `db`, or a transaction handle. Both aggregates take one so the pulsecheck
 * script can build a fixture week, assert against it and roll the whole thing
 * back — the ledger's attribution rules have no way to show themselves wrong on
 * a screen, so they are asserted against a known answer instead.
 */
type Executor = { execute: (q: any) => Promise<any> };

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

/**
 * NO TIES. Ranked by bet count, and where counts are equal, by which entity
 * REACHED that count first.
 *
 * An entity gets to N bets at the moment its Nth wager is placed — and since N
 * is its total, that is simply its most recent one. So `MAX(created) ASC` is
 * "who got here first", and `bets DESC` before it means the leader is only ever
 * displaced by something with strictly more. A new bet on a tied entity pushes
 * it DOWN the order rather than up, which is correct: it arrived at that count
 * later than the entity already sitting there.
 *
 * It replaced `wagered DESC` as the tie-break, which was a second contest
 * rather than a rule — a card could change its answer because someone staked
 * more on the same number of bets, and two entities level on both would still
 * be ordered arbitrarily by the planner. This is total: no two wagers share a
 * timestamp in practice, and the ordering never depends on row order.
 */
const NO_TIES = sql`ORDER BY bets DESC, last_bet ASC`;

/**
 * This week's three leaderboards: bets placed and money staked, per entity.
 *
 * Includes settled bets. Nothing about a week is hidden once it starts playing
 * — the panel says what the week was bet, and that claim does not change when
 * the games kick off.
 */
export async function volumeForWeek(exec: Executor, weekId: string, limit: number) {
  const legs = legsFor(weekId);

  // Each aggregate collapses to one row per (entity, ticket) before summing, so
  // a multi-leg parlay on one entity contributes its stake once. `kind` is in
  // the DISTINCT because ids are UUIDs from three different tables — collision
  // is not a real risk, but the key is honestly (table, id) and saying so costs
  // nothing.
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

/**
 * Last week's money, per entity.
 *
 * `profit` and `lost` follow the ATTRIBUTION rules in the file header: a
 * winning parlay pays every entity on it in full, a losing one charges only the
 * entities whose own leg missed.
 */
export async function ledgerForWeek(exec: Executor, weekId: string, limit: number) {
  const legs = legsFor(weekId);

  // Per (entity, ticket): what that ticket paid the entity, and what it cost
  // it. A ticket is never on both sides — the CASEs are exclusive on outcome.
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
  // ORDER BY lost DESC inside DISTINCT ON is load-bearing: a parlay with two
  // legs on one player, one of which missed, must keep the row that charges it.
  // Without it Postgres keeps an arbitrary leg and the loss silently vanishes.

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

  // Teams rank by VOLUME within an outcome bucket, not by money: the card asks
  // which heavily-backed team came through, so net decides the bucket and bets
  // decide the winner of it. That also settles a team whose moneyline won while
  // its spread did not — one net, one bucket.
  //
  // Every tie-break here is `lastBet ASC` — whoever reached the figure first
  // keeps the card until something strictly beats it. Same rule as NO_TIES
  // above, expressed in JS because these four lists are filtered into buckets
  // after the query rather than ordered by it.
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
  // The week we are inside, else the next to start, else the first unresolved
  // one at all — the same three-step fallback /weeks/public/current uses, so
  // the panel and the games strip can never disagree about which week it is.
  const now = new Date();
  const current =
    (await db.query.weeks.findFirst({
      where: and(eq(weeks.resolved, false), lte(weeks.startDate, now), gte(weeks.endDate, now)),
      orderBy: asc(weeks.number),
    })) ??
    (await db.query.weeks.findFirst({
      where: and(eq(weeks.resolved, false), gt(weeks.startDate, now)),
      orderBy: asc(weeks.startDate),
    })) ??
    (await db.query.weeks.findFirst({ where: eq(weeks.resolved, false), orderBy: asc(weeks.number) }));

  // Last week is the most recently RESOLVED week, not `current.number - 1`.
  // Between Sunday night and the Tuesday 11:00 UTC resolve, this week's games
  // are played but ungraded — and grading is what the money panel reads. So it
  // keeps showing the week before until the resolve lands, rather than briefly
  // showing an empty ledger for a week that has finished.
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

/**
 * Cached in front of the aggregate, the way `betCounts.ts` is and for the same
 * reason: /home is the page every signed-in session lands on, so a busy moment
 * is everyone running the same six group-bys at once.
 *
 * 60s. The numbers move when someone places a bet, which is not a thing anyone
 * is watching in real time — and the last-week half cannot move at all until a
 * Tuesday resolve. Per-process and in-memory, no invalidation: the TTL is the
 * whole policy.
 *
 * WHY A TTL AND NOT A BACKGROUND WORKER
 *
 * A worker would recompute on a timer whether or not anyone is looking, and its
 * result would live in *that replica's* memory — so a second backend replica
 * would never see it, and handing the value across would mean Redis or a table
 * existing purely to carry it. A lazy cache costs nothing at zero traffic, and
 * several replicas each keeping their own copy is fine: worst case one extra
 * query per replica per minute.
 *
 * A worker only starts to win when the aggregate is too slow to sit inside a
 * request even once a minute, and at that point the answer is not a worker
 * either — it is materialising the numbers as bets are placed and selecting
 * them back. A worker is the middle option with the fixed cost of materialising
 * and none of the freshness.
 *
 * THE HALF THAT SHOULD NOT BE CACHED AT ALL — do this when it costs something
 *
 * `last` is computed from settled bets on a RESOLVED week, so it cannot change
 * until the next Tuesday resolve. Caching it means paying for a constant once
 * every TTL forever; polling it means asking a question whose answer is already
 * known. It wants computing **once, at the moment that freezes it** — in
 * `triggerPostWeekActions` (services/autoPlayoffs.ts), alongside the playoff
 * advance that already runs there — and storing the result to read back
 * directly.
 *
 * Deliberately not done yet: no week has resolved, so there is nothing to
 * precompute and it would be untested scaffolding. `ledgerForWeek` already
 * takes its executor as a parameter and returns the exact shape the response
 * carries, so that change is a call site and a table — the response shape does
 * not move, and neither does the client.
 */
const CACHE_TTL_MS = 60_000;

/**
 * The cache holds the in-flight PROMISE, not the resolved value.
 *
 * Storing the value leaves a stampede at every expiry: the entry goes stale,
 * and every request that arrives before the first one finishes also misses and
 * runs its own copy of six group-bys — so the busiest moment is exactly the
 * moment the cache stops absorbing anything. Holding the promise means those
 * callers await the one query already running.
 *
 * `at` is stamped when the query STARTS, so a slow query cannot extend its own
 * lifetime past the TTL. A rejected promise is evicted rather than cached: a
 * failed aggregate must not be served to everyone for the next minute, and the
 * next caller should retry rather than inherit the error.
 */
let cache: { at: number; limit: number; data: Promise<Pulse> } | null = null;

export async function homePulse(limit = 5): Promise<Pulse> {
  const now = Date.now();
  if (cache && cache.limit === limit && now - cache.at < CACHE_TTL_MS) return cache.data;

  const entry = { at: now, limit, data: buildPulse(limit) };
  cache = entry;
  entry.data.catch(() => { if (cache === entry) cache = null; });
  return entry.data;
}
