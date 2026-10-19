import { db } from "../db/db";
import { eq, and, isNull, inArray, count } from "drizzle-orm";
import { weeks, games, gameLines, players, props, picks, gamePicks, parlayLegs } from "../db/schema";
import { getNFLWeekGames } from "./espnApi";
import { SGOEvent, SGOProp, fetchEventsByID, fetchEventsByDate } from "./sportsGameOdds";
import { backfillPlayerIdentities } from "./playerIdentity";
import { invalidateAllMarkets, invalidateGameMarkets } from "./weekBoard";

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
    invalidateAllMarkets();
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
        // Only overwrite when ESPN has a value; it drops weather after the game.
        ...(g.weather != null ? { weather: g.weather, weatherTemp: g.weatherTemp } : {}),
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

// Replaces the game's board. Markets the feed stopped returning are deleted, or
// marked unavailable if someone has a bet on them.
export async function applyEvent(
  ev: SGOEvent,
  game: { id: string; gameDate: Date },
): Promise<{ lines: number; props: number; retired: number }> {
  // Never move a price on a game that has kicked off - bets are locked there.
  if (new Date(game.gameDate) <= new Date()) return { lines: 0, props: 0, retired: 0 };
  try {
    return await writeEvent(ev, game);
  } finally {
    // In finally: a partial write still changed rows.
    invalidateGameMarkets(game.id);
  }
}

async function writeEvent(
  ev: SGOEvent,
  game: { id: string; gameDate: Date },
): Promise<{ lines: number; props: number; retired: number }> {
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

  // Guess position from all of a player's markets, most telling first. ESPN
  // corrects it later when the player image is resolved.
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

// Never called with an empty live set, so a blank response can't wipe the board.
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
