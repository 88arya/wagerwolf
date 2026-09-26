import { sql } from "drizzle-orm";
import { db } from "../db/db";
import { currentWeekId } from "./currentWeek";

/**
 * A SAMPLE of the current week's board — player props and team markets — for
 * the landing page's marquee.
 *
 * IT IS A MARKETING SAMPLE, NOT THE BOARD, and that is what lets it be
 * unauthenticated. `/weeks/public/current` returns fixtures and the two
 * moneylines and stops there, on the stated grounds that "a moneyline beside a
 * fixture is what any scoreboard shows; the rest is the thing you sign in to
 * bet into". That still holds for the product: this returns at most one prop
 * per player, caps the whole thing, and sends no prop, game or player ids, no
 * oddIDs and no alternate ladders — enough to show what a market looks like,
 * nowhere near enough to shop a line or place one.
 *
 * Nothing in the app reads it. If the trade ever looks wrong, deleting this
 * file and its route is the entire revert.
 *
 * THE WHOLE WEEK'S BOARD, INCLUDING GAMES ALREADY PLAYED. There is deliberately
 * no `gameDate > now()` filter: the sample is meant to be the week's slate as
 * chosen on Tuesday, not a live list of what is still bettable. Filtering by
 * kickoff drained it as the week ran — see the cache note at the bottom.
 */
/**
 * A ceiling, not a target. The marquee asks for everything; this exists so a
 * malformed `?limit=` cannot ask the process to serialise the entire board.
 * Week 1 has 268 eligible players and 16 games, so the real answer is ~284.
 */
const MAX = 500;

export type PublicMarket =
  | {
      kind: "prop";
      player: string;
      team: string;
      position: string;
      /** ESPN headshot id. Never null — see the WHERE clause on propSample. */
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

/**
 * THE SIZE OF THE WHOLE BOARD, not of the sample. The landing page's subtitle
 * counts what a signed-in user can bet this week; the marquee below it shows
 * ~285 of those, one prop per player and one market per game. Sending the
 * sample's own length instead would undercount the board by a factor of four
 * and understate the product.
 */
export type BoardTotals = {
  /** Every available GameLine on the week, ALT ladders included. */
  lines: number;
  /** Every available Prop on the week — all stat types, all players. */
  props: number;
};

export type PublicBoard = {
  markets: PublicMarket[];
  totals: BoardTotals;
};

function rowsOf(r: any): any[] {
  return Array.isArray(r) ? r : (r?.rows ?? []);
}

/**
 * PLAYERS WITH A HEADSHOT ONLY. Every prop card carries a picture, so one
 * without would be the odd card on the row rather than a graceful fallback —
 * and only 63 of 298 players currently have an espnId, because images are
 * resolved lazily by GET /players/:id/image as players are viewed inside the
 * app. A public page cannot trigger that backfill: the route is authenticated
 * and this endpoint sends no ids. Filtering is the honest option — this is a
 * sample, and sampling the ones we can draw properly costs nothing.
 *
 * DISTINCT ON (playerId) so the sample spreads across PEOPLE rather than
 * returning eight markets on one quarterback, which is what an unfiltered LIMIT
 * gives: props cluster hard by player.
 */
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
    // ONE SIDE. Prop.odds is the over; the under is not stored on the row, and
    // sending the same number for both would show a price no book offers — a
    // +1280 over has a heavily negative under.
    odds: Number(r.odds),
    game: r.game,
  }));
}

/**
 * MONEYLINE AND SPREAD ONLY, each resolved to the team it names.
 *
 * Totals are excluded deliberately: an over is not a bet on either side, so it
 * has no crest to carry and would be the one card in a row without one. The
 * ALT_ ladders are excluded too — they are the same market at a different
 * number, so a sample of them is eight copies of one card.
 */
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
  // ONE MARKET PER GAME, ROTATING WHICH ONE. The query returns all four of a
  // game's markets together (it is ordered by game id), so taking the first N
  // straight off it gave four cards from one fixture and four from the next —
  // eight team cards covering two games out of sixteen, with the same two teams
  // repeated four times each.
  //
  // Grouping by game and taking one apiece spreads them across the whole slate;
  // stepping the choice by the game's index rotates through away moneyline,
  // home moneyline, away spread, home spread, so the sample shows both sides
  // and both market types rather than sixteen moneylines.
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

/**
 * Everything eligible, in one list. The marquee shuffles on every request, so
 * there is nothing to interleave: order is decided at the end, not here.
 *
 * THE INTERLEAVE THAT USED TO LIVE HERE IS GONE, and with it a genuinely
 * fragile invariant. It emitted a fixed ratio of props to team cards, and the
 * marquee dealt that list round-robin into rows — so the ratio's period had to
 * stay coprime with the row count or every team card landed in the same row.
 * That broke twice (2:1 into 3 rows, then 3:1 into 4). A shuffled list cannot
 * have the problem: nothing lines up with anything.
 */
/**
 * Two counts, in one round trip.
 *
 * NO `available` FILTER, unlike the samples. The samples must not show a card
 * nobody can bet; a COUNT is answering a different question — how big the
 * week's board is — and `available` flips to false as the book pulls markets
 * through the week. Counting only what is still open makes the number shrink
 * across Sunday, so the figure on the landing page would depend on when the
 * snapshot below happened to be taken. Every market the week HAS is both the
 * stabler number and the one the label means.
 *
 * THE ALT LADDERS COUNT. They are excluded from the team sample (a ladder is
 * one market at eight numbers, so sampling it gives eight copies of one card)
 * but they are genuinely bettable, and ~3,490 is the honest size of the board
 * where 96 core lines is the honest size of the *fixture* list.
 */
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

/**
 * THE TOTALS ARE A HIGH-WATER MARK, not a snapshot. Unlike the card sample, which
 * stays frozen for the week.
 *
 * A snapshot undercounted by construction. It was taken on the first request
 * after rollover, which is Tuesday evening, and books post game lines early but
 * player props mostly Wednesday to Saturday: week 3 froze at 426 props on a board
 * that went on to carry far more (week 1 locally: 1,078 at snapshot, 1,648 by
 * Sunday). Weeks before it only looked right because rollover used to run late.
 *
 * A plain live count is not the answer either, because it can FALL: a refresh
 * deletes markets the feed stops returning when nothing is riding on them, and a
 * manual week resync can do the same to games already played. By Monday night
 * the landing page would be advertising a shrinking board.
 *
 * So recount every few minutes and keep the larger. The conditional UPDATE keeps
 * it monotonic across replicas: a replica with a stale memo can never write a
 * smaller number over a bigger one, and re-reading the column afterwards means
 * every process converges on the largest total any of them has seen.
 *
 * Compared on the SUM, since the SUM is what the landing page prints. Lines and
 * props move together as one pair, so the pair on screen always came from a
 * single real count.
 */
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

/**
 * KEYED ON THE WEEK, NOT ON A CLOCK. The sample changes once a week and holds
 * for the rest of it.
 *
 * WHY NOT A TTL. This ran on a 60s cache and re-picked its sample every minute,
 * which was wrong in a way that only showed up late in the week: markets are
 * dropped from the board as they settle, so a sample re-picked on Sunday night
 * is drawn from whatever is left, and by Monday that is almost nothing. The
 * marquee would quietly empty out across the week it was advertising.
 *
 * WHEN IT ROTATES. On whichever week `currentWeekId` names — see
 * services/currentWeek.ts, which is the one definition the games strip uses
 * too. This file used to carry its own, "the first unresolved week", on the
 * grounds that `Week.resolved` flips on the Tuesday resolve and so needs no
 * weekday arithmetic. That holds only while the resolve is punctual; when it is
 * not, the marquee sticks on a played-out slate while the strip above it has
 * already moved on, which is precisely what shipped on 16 Sept 2026.
 *
 * A RESTART MUST NOT RECOMPUTE, and for a long time this said the opposite —
 * that recomputing was harmless because the selection is deterministic. It is
 * not. Both queries move underneath a running week:
 *
 *   - `available = true` SHRINKS as the book pulls markets, so a player's
 *     chosen prop can vanish and the DISTINCT ON picks a different one — a
 *     different stat and a different line on the same card.
 *   - `Player.espnId IS NOT NULL` GROWS: headshots are backfilled lazily by
 *     GET /players/:id/image as players are viewed inside the app, so more
 *     players qualify every day and the sample gets longer.
 *
 * In-process, none of that showed: the cache was built once and held. Across a
 * restart it all lands at once, and a restart mid-season is an ordinary event —
 * every deploy is one. So the board is COMPUTED ONCE AND WRITTEN TO THE WEEK,
 * and every process from then on reads that row.
 *
 * WHY THE WEEK ROW rather than a longer-lived in-process cache: it is the same
 * lifetime the data actually has, it survives deploys and reboots, and multiple
 * backend replicas share one answer instead of each freezing a different
 * Tuesday. Week.publicBoard is null until the first request after rollover.
 *
 * WHAT IS STILL LIVE: nothing. The prices on these cards are the prices at
 * snapshot time and do not follow the poller. That is the trade for stability,
 * and it is the right one here — this is a marketing surface showing what a
 * board looks like, not a price anyone acts on.
 */
/* A READ-THROUGH MEMO, not the cache any more. The row is the authority; this
   only saves a query per request. It is keyed by week so a rollover drops it,
   and it holds the whole pool rather than a page — the limit is applied after
   the shuffle below, so baking it in would mean keying per limit for no
   reason. */
/**
 * TWO CACHES ARE STACKED HERE, and knowing that is the difference between a
 * five-minute fix and an hour of confusion.
 *
 *   1. `Week.publicBoard` — a jsonb column, written once per week. Its totals
 *      are the one exception and are raised in place; see `raiseTotals`.
 *   2. `memo` — this, a module-level copy held in the process.
 *
 * The memo is only refreshed when the week **ID** changes. So clearing the
 * database column does NOT take effect in a running process: the id is the same,
 * the memo is not re-read, and the stale board keeps being served.
 *
 * ANY MID-WEEK CORRECTION THEREFORE NEEDS AN APP RESTART as well as the column
 * cleared. This bit on 11 Sept 2026: the first production odds sync ran after
 * the board had already been computed and cached empty, and the marquee kept
 * serving zero markets through a column clear, a redeploy of Caddy, and several
 * confident explanations, until the app container was restarted.
 *
 * It is not worth adding invalidation for a POPULATED board — that legitimately
 * changes once a week, and a restart is what a deploy does anyway.
 *
 * AN EMPTY BOARD IS DIFFERENT, AND IS NOT MEMOISED AT ALL. See the guard in
 * `cachedPublicBoard`. `storedBoard` already refuses to write an empty snapshot
 * to the column for this reason, but the memo used to freeze one in the process
 * regardless — so the column guard bought nothing once a single request had
 * landed in the gap, which is exactly the 11 Sept failure above.
 *
 * That gap used to be rare and is now ROUTINE. `currentWeekId` follows
 * services/currentWeek, which rolls over at the old week's `endDate` — about
 * fifteen minutes after the Tuesday 18:00 ESPN/SGO discovery that populates the
 * new week's odds. Fifteen minutes is the whole margin, and if discovery is
 * late, slow or fails, the marquee is pointed at a week with no props at all.
 * Before the ladder moved to dates, rollover trailed the resolve and the new
 * week always had odds by then; the old reasoning was written for that world.
 */
let memo: { weekId: string; board: PublicBoard; totalsCheckedAt: number } | null = null;


/**
 * The stored board for a week, computing and storing it if this is the first
 * request since rollover.
 *
 * THE WRITE IS CONDITIONAL — `WHERE "publicBoard" IS NULL` — so two requests
 * arriving together cannot overwrite each other with two different snapshots.
 * The loser's work is discarded and it re-reads the winner's, which is what
 * keeps "one board per week" true under concurrency and across replicas.
 */
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

  // AN EMPTY BOARD IS NEVER STORED. A snapshot is held for the whole week, so
  // storing one taken before the slate exists would freeze an empty marquee
  // until the next Tuesday. The scheduler clears this column after SGO
  // discovery for the same reason; this is the second guard, for the case where
  // the column is cleared and a request arrives before the odds land.
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
  // No open week — between the last resolve and the next schedule landing. An
  // empty board is a real state and the marquee hides itself on it, heading
  // and all.
  if (!weekId) return { markets: [], totals: { lines: 0, props: 0 } };

  if (!memo || memo.weekId !== weekId) {
    const board = await storedBoard(weekId);
    // NEVER MEMOISE AN EMPTY BOARD. The memo is only ever refreshed on a week
    // ID change, so caching the gap between rollover and the odds landing pins
    // an empty marquee for the life of the process — through a column clear and
    // through the scheduler's own reset, fixable only by a restart. Leaving it
    // unmemoised costs two queries per landing-page request for the minutes
    // that gap is open, and the marquee fills itself the moment the odds do.
    if (board.markets.length === 0) return board;
    // Checked-at 0, so the first request after a deploy recounts rather than
    // re-serving whatever total the row held when the process stopped.
    memo = { weekId, board, totalsCheckedAt: 0 };
  }
  // A local, not the module variable: the recount below awaits, and a rollover
  // request can replace `memo` meanwhile. This request stays on its own week.
  const m = memo;

  // The totals, and only the totals, follow the board up. Stamped BEFORE the
  // await so concurrent requests in the same window do not each recount; a
  // failed recount keeps the last good number and tries again next window.
  if (Date.now() - m.totalsCheckedAt >= TOTALS_REFRESH_MS) {
    m.totalsCheckedAt = Date.now();
    try {
      const totals = await raiseTotals(weekId);
      if (totals) m.board = { ...m.board, totals };
    } catch (err) {
      console.error("[publicMarkets] totals refresh failed:", err);
    }
  }
  // SHUFFLED PER REQUEST, over a POOL that is fixed for the week. The two are
  // different decisions and only one of them rotates weekly: which markets are
  // on the board is settled on Tuesday, the order they appear in is not, so
  // two visits to the landing page do not show an identical wall of cards.
  //
  // A copy, never the memoised array — shuffling in place would leave it
  // permanently reordered and make the "fixed pool" claim quietly false.
  //
  // SLICED AFTER THE SHUFFLE, and that ordering is the fix for a real bug. The
  // limit used to be applied inside publicMarketSample, which returns props
  // followed by team markets — so any limit below the prop count (269) took
  // props only and returned ZERO team cards. The endpoint's own default of 12
  // did exactly that. Shuffling first makes the slice a fair sample of both
  // kinds instead of a prefix of one.
  //
  // THE TOTALS ARE STORED WITH THE SAMPLE, in one row, so both always describe
  // the same week — but they no longer describe the same MOMENT. The cards are
  // Tuesday's snapshot; the count is the largest board the week has reached.
  // A card can therefore be one of the markets counted but no longer open,
  // which a count of "markets this week" already allowed.
  const n = Math.min(Math.max(Math.trunc(limit) || 12, 1), MAX);
  return { markets: shuffle(m.board.markets).slice(0, n), totals: m.board.totals };
}

/**
 * Fisher-Yates, on a copy. `sort(() => Math.random() - 0.5)` is the tempting
 * one-liner and it is not a shuffle — the comparator is inconsistent, so the
 * result is biased in a way that depends on the sort implementation.
 */
function shuffle<T>(input: readonly T[]): T[] {
  const a = [...input];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
