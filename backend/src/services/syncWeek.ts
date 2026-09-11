import { db } from "../db/db";
import { eq, and, isNull, inArray, count } from "drizzle-orm";
import { weeks, games, gameLines, players, props, picks, gamePicks, parlayLegs } from "../db/schema";
import { getNFLWeekGames } from "./espnApi";
import { SGOEvent, SGOProp, fetchEventsByID, fetchEventsByDate } from "./sportsGameOdds";
import { backfillPlayerIdentities } from "./playerIdentity";

export async function syncESPNGames(weekId: string): Promise<{ synced: number }> {
  const week = await db.query.weeks.findFirst({ where: eq(weeks.id, weekId) });
  if (!week) throw new Error("Week not found");

  const espnGames = await getNFLWeekGames(new Date(week.startDate), week.number);
  if (espnGames.length === 0) {
    console.log(`[sync] ESPN no games for week ${week.number}`);
    return { synced: 0 };
  }

  // Delete fake games (null espnId) and their props/lines before inserting real ones
  const fakeGameRows = await db.select({ id: games.id }).from(games)
    .where(and(eq(games.weekId, weekId), isNull(games.espnId)));
  if (fakeGameRows.length > 0) {
    const fakeIds = fakeGameRows.map(g => g.id);
    await db.delete(props).where(inArray(props.gameId, fakeIds));
    await db.delete(gameLines).where(inArray(gameLines.gameId, fakeIds));
    await db.delete(games).where(inArray(games.id, fakeIds));
  }

  // Update week dates to match real ESPN schedule
  const times = espnGames.map(g => g.gameDate.getTime());
  const weekStart = new Date(Math.min(...times));
  const weekEnd = new Date(Math.max(...times));
  weekEnd.setHours(weekEnd.getHours() + 18);
  await db.update(weeks).set({ startDate: weekStart, endDate: weekEnd }).where(eq(weeks.id, weekId));

  let synced = 0;
  for (const g of espnGames) {
    await db.insert(games)
      .values({
        weekId: week.id, homeTeam: g.homeTeam, awayTeam: g.awayTeam, gameDate: g.gameDate, espnId: g.espnId,
        indoor: g.indoor, weather: g.weather, weatherTemp: g.weatherTemp,
        homeRecord: g.homeRecord, awayRecord: g.awayRecord,
      })
      .onConflictDoUpdate({
        target: games.espnId,
        set: {
          homeTeam: g.homeTeam, awayTeam: g.awayTeam, gameDate: g.gameDate,
          indoor: g.indoor, weather: g.weather, weatherTemp: g.weatherTemp,
          homeRecord: g.homeRecord, awayRecord: g.awayRecord,
        },
      });
    synced++;
  }

  console.log(`[sync] ESPN games for week ${week.number}: ${synced} synced`);
  return { synced };
}

export async function syncScores(weekId: string): Promise<{ updated: number }> {
  const week = await db.query.weeks.findFirst({ where: eq(weeks.id, weekId) });
  if (!week) throw new Error("Week not found");

  const espnGames = await getNFLWeekGames(new Date(week.startDate), week.number);
  let updated = 0;
  for (const g of espnGames) {
    const existing = await db.query.games.findFirst({ where: eq(games.espnId, g.espnId) });
    if (!existing) continue;
    await db.update(games)
      .set({
        status: g.status,
        homeScore: g.homeScore,
        awayScore: g.awayScore,
        statusDetail: g.statusDetail,
        indoor: g.indoor,
        // Weather only appears inside 10 days of kickoff, so this minute-by-minute
        // sync is what actually fills it in. Only written when ESPN has a value —
        // otherwise a far-out game would keep nulling a forecast we already had,
        // and ESPN drops weather again once the game is FINAL.
        ...(g.weather != null ? { weather: g.weather, weatherTemp: g.weatherTemp } : {}),
        // Same guard as weather: only overwrite when ESPN actually has a
        // record, so a null response can't wipe one we already stored.
        ...(g.homeRecord != null ? { homeRecord: g.homeRecord } : {}),
        ...(g.awayRecord != null ? { awayRecord: g.awayRecord } : {}),
      })
      .where(eq(games.espnId, g.espnId));
    updated++;
  }
  console.log(`[sync] Scores for week ${week.number}: ${updated} updated`);
  return { updated };
}

const POSITION_HINT: Record<string, string> = {
  PASSING_YARDS: "QB", PASSING_TOUCHDOWNS: "QB", PASSING_COMPLETIONS: "QB",
  PASSING_ATTEMPTS: "QB", PASSING_INTERCEPTIONS: "QB", PASSING_LONGEST: "QB",
  RUSHING_YARDS: "RB", RUSHING_TOUCHDOWNS: "RB", RUSHING_ATTEMPTS: "RB", RUSHING_LONGEST: "RB",
  RECEIVING_YARDS: "WR", RECEIVING_TOUCHDOWNS: "WR", RECEIVING_LONGEST: "WR", RECEPTIONS: "WR",
  SACKS: "DE", TACKLES_ASSISTS: "LB", DEFENSIVE_INTERCEPTIONS: "CB",
  FIELD_GOALS_MADE: "K", FIELD_GOAL_LONGEST: "K", KICKING_POINTS: "K", EXTRA_POINTS_MADE: "K",
};

/**
 * Find (or create) the Player a SportsGameOdds prop belongs to.
 *
 * SGO gives a stable `playerID` and the player's `teamID`, so this is an id
 * lookup, not the name-and-roster search the SharpAPI path needed. Name
 * matching survives only as a one-time bridge, so a player we already created
 * from ESPN gains an sgoId instead of being duplicated.
 */
async function resolveSGOPlayer(p: SGOProp, positionHint?: string): Promise<{ id: string } | null> {
  const bySgo = await db.query.players.findFirst({ where: eq(players.sgoId, p.sgoPlayerId) });
  if (bySgo) {
    if (bySgo.team !== p.team) {
      await db.update(players).set({ team: p.team }).where(eq(players.id, bySgo.id));
    }
    return bySgo;
  }

  const byName = await db.query.players.findFirst({
    where: (pl, { and, eq }) => and(eq(pl.name, p.playerName), eq(pl.team, p.team)),
  });
  if (byName) {
    await db.update(players).set({ sgoId: p.sgoPlayerId }).where(eq(players.id, byName.id));
    return byName;
  }

  // Position is a hint only — the bet page groups by stat type. The lazy image
  // route fills espnId and the headshot on first render.
  const [created] = await db.insert(players)
    .values({
      name: p.playerName, team: p.team,
      position: positionHint ?? POSITION_HINT[p.statType] ?? "FLEX", sgoId: p.sgoPlayerId,
    })
    .onConflictDoNothing()
    .returning();
  if (created) return created;

  return (await db.query.players.findFirst({
    where: (pl, { and, eq }) => and(eq(pl.name, p.playerName), eq(pl.team, p.team)),
  })) ?? null;
}

/**
 * Write one event's lines and props onto a Game we already hold.
 *
 * A sync *replaces* the game's board rather than adding to it. The upsert-only
 * version accreted: once a market was written it lived forever, so a prop the
 * book pulled — an injury scratch, a suspended line — stayed bettable at a
 * stale price no sportsbook was still offering.
 *
 * Anything the feed no longer returns is therefore retired. Rows nothing is
 * riding on are deleted outright; rows with bets on them are kept but flagged
 * `available: false`, because deleting a market someone holds a wager on would
 * strand the wager with nothing to settle against.
 */
export async function applyEvent(
  ev: SGOEvent,
  game: { id: string; gameDate: Date },
): Promise<{ lines: number; props: number; retired: number }> {
  // Never move a price on a game that has kicked off — bets are locked there.
  if (new Date(game.gameDate) <= new Date()) return { lines: 0, props: 0, retired: 0 };

  const liveMarkets = new Set<string>();
  let lineCount = 0;
  for (const l of ev.lines) {
    await db.insert(gameLines)
      .values({ gameId: game.id, market: l.market, label: l.label, odds: l.odds, line: l.line, oddID: l.oddID, available: true })
      .onConflictDoUpdate({
        target: [gameLines.gameId, gameLines.market],
        set: { label: l.label, odds: l.odds, line: l.line, oddID: l.oddID, available: true },
      });
    liveMarkets.add(l.market);
    lineCount++;
  }

  // Work out each player's position from *all* their markets before writing any
  // of them. Taken per-prop, whoever happened to be written first decided it —
  // and "touchdowns" implies no position at all, so anyone whose anytime-TD
  // market landed first was filed as FLEX.
  // Ranked, not first-wins. Array order decided this before, so a quarterback
  // whose rushing-yards prop happened to come before his passing props was
  // created as an RB — and nothing downstream corrected it, because the lazy
  // ESPN backfill only overwrote the literal "FLEX".
  //
  // The ranking is by how much the market actually tells you. Only a QB throws,
  // and only a K kicks, so those two are near-certain; the defensive markets are
  // close behind. Rushing and receiving are the ambiguous pair — a back catches
  // and a receiver takes handoffs — so they rank last and lose to anything else
  // the same player appears in.
  //
  // This narrows the window rather than closing it. GET /players/:id/image
  // replaces whatever landed here with ESPN's own answer on first render; this
  // just makes the placeholder right more often in the meantime.
  const HINT_RANK: Record<string, number> = { QB: 0, K: 1, DE: 2, LB: 2, CB: 2, RB: 3, WR: 3 };
  const hintByPlayer = new Map<string, string>();
  for (const p of ev.props) {
    const hint = POSITION_HINT[p.statType];
    if (!hint) continue;
    const held = hintByPlayer.get(p.sgoPlayerId);
    if (!held || (HINT_RANK[hint] ?? 9) < (HINT_RANK[held] ?? 9)) {
      hintByPlayer.set(p.sgoPlayerId, hint);
    }
  }

  const livePropKeys = new Set<string>();
  let propCount = 0;
  for (const p of ev.props) {
    const player = await resolveSGOPlayer(p, hintByPlayer.get(p.sgoPlayerId));
    if (!player) continue;
    const values = {
      line: p.line,
      odds: p.odds,
      source: "SHARP",
      altLadder: p.ladder.length > 0 ? p.ladder : null,
      oddID: p.oddID,
      available: true,
    };
    await db.insert(props)
      .values({ gameId: game.id, playerId: player.id, statType: p.statType as any, ...values })
      .onConflictDoUpdate({
        target: [props.gameId, props.playerId, props.statType],
        set: values,
      });
    livePropKeys.add(`${player.id}:${p.statType}`);
    propCount++;
  }

  const retired = await retireMissingMarkets(game.id, liveMarkets, livePropKeys);

  await db.update(games)
    .set({ oddsPolledAt: new Date(), externalId: ev.eventID })
    .where(eq(games.id, game.id));
  return { lines: lineCount, props: propCount, retired };
}

/**
 * Retire everything on this game the feed stopped returning.
 *
 * Only ever called with a non-empty live set — an event that came back with no
 * markets at all (a transient upstream blank) must not wipe the board.
 */
async function retireMissingMarkets(
  gameId: string,
  liveMarkets: Set<string>,
  livePropKeys: Set<string>,
): Promise<number> {
  let retired = 0;

  if (liveMarkets.size > 0) {
    const existing = await db.select().from(gameLines).where(eq(gameLines.gameId, gameId));
    const stale = existing.filter((gl) => !liveMarkets.has(gl.market));
    for (const gl of stale) {
      const [betOn] = await db.select({ n: count() })
        .from(gamePicks).where(eq(gamePicks.gameLineId, gl.id));
      const [leggedOn] = await db.select({ n: count() })
        .from(parlayLegs).where(eq(parlayLegs.gameLineId, gl.id));
      if ((betOn?.n ?? 0) + (leggedOn?.n ?? 0) > 0) {
        if (gl.available) {
          await db.update(gameLines).set({ available: false }).where(eq(gameLines.id, gl.id));
          retired++;
        }
      } else {
        await db.delete(gameLines).where(eq(gameLines.id, gl.id));
        retired++;
      }
    }
  }

  if (livePropKeys.size > 0) {
    const existing = await db.select().from(props).where(eq(props.gameId, gameId));
    const stale = existing.filter((p) => !livePropKeys.has(`${p.playerId}:${p.statType}`));
    for (const p of stale) {
      const [betOn] = await db.select({ n: count() }).from(picks).where(eq(picks.propId, p.id));
      const [leggedOn] = await db.select({ n: count() }).from(parlayLegs).where(eq(parlayLegs.propId, p.id));
      if ((betOn?.n ?? 0) + (leggedOn?.n ?? 0) > 0) {
        if (p.available) {
          await db.update(props).set({ available: false }).where(eq(props.id, p.id));
          retired++;
        }
      } else {
        await db.delete(props).where(eq(props.id, p.id));
        retired++;
      }
    }
  }

  return retired;
}

/**
 * Match a week's games to SGO events by date range and write their odds.
 *
 * Costs one entity per event returned. Used to discover eventIDs for a new
 * week; routine refreshes go through syncOddsForGames, which spends only on the
 * games actually due.
 */
export async function syncOdds(weekId: string): Promise<{ games: number; lines: number; props: number }> {
  const week = await db.query.weeks.findFirst({ where: eq(weeks.id, weekId) });
  if (!week) throw new Error("Week not found");

  const weekGames = await db.select().from(games).where(eq(games.weekId, week.id));
  if (weekGames.length === 0) return { games: 0, lines: 0, props: 0 };

  const start = new Date(new Date(week.startDate).getTime() - 24 * 3600 * 1000);
  const end = new Date(new Date(week.endDate).getTime() + 24 * 3600 * 1000);
  const events = await fetchEventsByDate(start, end, weekGames.length + 4);

  const byMatchup = new Map(weekGames.map((g) => [`${g.awayTeam}@${g.homeTeam}`, g]));
  let gamesSynced = 0, lines = 0, propsWritten = 0;
  for (const ev of events) {
    const game = byMatchup.get(`${ev.awayTeam}@${ev.homeTeam}`);
    if (!game) continue;
    const r = await applyEvent(ev, game);
    if (r.lines || r.props) gamesSynced++;
    lines += r.lines;
    propsWritten += r.props;
  }

  console.log(`[sync] Odds for week ${week.number}: ${gamesSynced} games, ${lines} lines, ${propsWritten} props`);

  // IDENTITY IS RESOLVED HERE, not when someone looks at the player.
  //
  // The sync is what CREATES players, so it is the only place that knows a new
  // one has arrived. Before this, `espnId` was written solely by
  // `GET /players/:id/image` — a signed-in, view-time request — so the landing
  // page's prop cards could never appear on a fresh deployment, because the
  // marquee's whole audience is people who have not signed in.
  //
  // Awaited rather than fired and forgotten: a caller that reports "1072 props
  // written" should not return while a third of them are still ineligible to be
  // displayed. It is bounded and never throws — see backfillPlayerIdentities.
  const ids = await backfillPlayerIdentities();
  if (ids.scanned) {
    console.log(`[sync] Player identities: ${ids.resolved}/${ids.scanned} resolved` +
      (ids.unresolved ? `, ${ids.unresolved} unmatched by ESPN` : ""));
  }
  return { games: gamesSynced, lines, props: propsWritten };
}

/** Refresh a hand-picked set of games by their known SGO eventID. */
export async function syncOddsForGames(
  gameRows: Array<{ id: string; gameDate: Date; externalId: string | null }>,
): Promise<{ games: number; lines: number; props: number }> {
  const withIds = gameRows.filter((g) => g.externalId);
  if (withIds.length === 0) return { games: 0, lines: 0, props: 0 };

  const events = await fetchEventsByID(withIds.map((g) => g.externalId!));
  const byEvent = new Map(withIds.map((g) => [g.externalId!, g]));

  let gamesSynced = 0, lines = 0, propsWritten = 0;
  for (const ev of events) {
    const game = byEvent.get(ev.eventID);
    if (!game) continue;
    const r = await applyEvent(ev, game);
    if (r.lines || r.props) gamesSynced++;
    lines += r.lines;
    propsWritten += r.props;
  }

  // IDENTITY IS RESOLVED HERE, not when someone looks at the player.
  //
  // The sync is what CREATES players, so it is the only place that knows a new
  // one has arrived. Before this, `espnId` was written solely by
  // `GET /players/:id/image` — a signed-in, view-time request — so the landing
  // page's prop cards could never appear on a fresh deployment, because the
  // marquee's whole audience is people who have not signed in.
  //
  // Awaited rather than fired and forgotten: a caller that reports "1072 props
  // written" should not return while a third of them are still ineligible to be
  // displayed. It is bounded and never throws — see backfillPlayerIdentities.
  const ids = await backfillPlayerIdentities();
  if (ids.scanned) {
    console.log(`[sync] Player identities: ${ids.resolved}/${ids.scanned} resolved` +
      (ids.unresolved ? `, ${ids.unresolved} unmatched by ESPN` : ""));
  }
  return { games: gamesSynced, lines, props: propsWritten };
}

/** Every unresolved week, one date-ranged pull each. Scripts only, never cron. */
export async function syncOddsAllWeeks(): Promise<{ weeks: number; games: number; lines: number; props: number }> {
  const weekList = await db.query.weeks.findMany({
    where: (w, { eq }) => eq(w.resolved, false),
    orderBy: (w, { asc }) => [asc(w.number)],
  });
  let gamesSynced = 0, lines = 0, propsWritten = 0;
  for (const week of weekList) {
    const r = await syncOdds(week.id);
    gamesSynced += r.games;
    lines += r.lines;
    propsWritten += r.props;
  }
  return { weeks: weekList.length, games: gamesSynced, lines, props: propsWritten };
}
