import { db } from "../db/db";
import { eq, and, isNull, lte, gt, isNotNull } from "drizzle-orm";
import { games, weeks } from "../db/schema";
import { syncOddsForGames, syncOdds } from "./syncWeek";
import { fetchUsage } from "./sportsGameOdds";

/**
 * Tiered odds polling.
 *
 * The quota is 2500 entities a month and one entity is one game refreshed, so
 * the only lever we have is *which games we refresh and how often*. A flat
 * cadence spends the same on a Tuesday — when nothing moves — as on Sunday
 * morning, which is the wrong shape.
 *
 * Cadence is therefore a function of each game's own time-to-kickoff, never of
 * the week boundary. That is what lets a Thursday night game and a Monday night
 * game sit in the same week and still each get a sensible schedule: on any
 * given tick they are simply at different TTKs.
 *
 *   > 72h   every 24h    lines barely move
 *   72-24h  every  6h    early shaping
 *   24-6h   every  2h    injury and inactive news
 *   < 6h    every  1h    final moves
 *   kicked off           stop entirely; bets are locked
 *
 * Cost, worst case (16 games, all of a week's slate):
 *   ~26 refreshes per game  ->  16 x 26 = 416 entities per week
 *   5-week month: 2080 + 80 (next-week discovery) + 80 (settlement) = 2240 / 2500
 *
 * The 5-week month is the binding case. A naive flat cadence blows it.
 */

interface Tier { withinHours: number; everyMinutes: number }

const TIERS: Tier[] = [
  { withinHours: 6,        everyMinutes: 60 },
  { withinHours: 24,       everyMinutes: 120 },
  { withinHours: 72,       everyMinutes: 360 },
  { withinHours: Infinity, everyMinutes: 1440 },
];

export function intervalMinutesFor(hoursToKickoff: number): number {
  for (const t of TIERS) if (hoursToKickoff <= t.withinHours) return t.everyMinutes;
  return TIERS[TIERS.length - 1].everyMinutes;
}

/** Is this game due a refresh right now? */
export function isDue(game: { gameDate: Date; oddsPolledAt: Date | null }, now: Date): boolean {
  const msToKickoff = new Date(game.gameDate).getTime() - now.getTime();
  if (msToKickoff <= 0) return false;              // kicked off — never spend again
  if (!game.oddsPolledAt) return true;             // never polled

  const hoursToKickoff = msToKickoff / 3_600_000;
  const minutesSincePoll = (now.getTime() - new Date(game.oddsPolledAt).getTime()) / 60_000;
  return minutesSincePoll >= intervalMinutesFor(hoursToKickoff);
}

// Stop spending on odds when the month is nearly gone, so settlement — which
// cannot be deferred without leaving bets pending — always has room.
const RESERVE_ENTITIES = 150;

/**
 * Only games kicking off within this many days are polled at all.
 *
 * This is a budget guard, not a nicety. Without it the poller picks up every
 * game in every unresolved week — 121 games here — and the outermost tier alone
 * (one refresh a day) would spend 121 entities a day, or ~3,600 a month against
 * a 2,500 cap. A week's slate runs Tue -> Mon, so 8 days covers the current week
 * with a day of slack and nothing beyond it.
 */
const POLL_HORIZON_DAYS = 8;

/**
 * One tick. Refreshes only the games actually due, in a single request.
 *
 * Deliberately scoped to unresolved weeks whose games are still upcoming: a
 * cadence over all 8 future weeks would be ~112 games and would drain a month
 * of quota in days.
 */
export async function pollDueGames(): Promise<{ polled: number; skipped: boolean }> {
  const now = new Date();

  const horizon = new Date(now.getTime() + POLL_HORIZON_DAYS * 86_400_000);

  const candidates = await db.select({
    id: games.id, gameDate: games.gameDate, externalId: games.externalId, oddsPolledAt: games.oddsPolledAt,
  })
    .from(games)
    .innerJoin(weeks, eq(weeks.id, games.weekId))
    .where(and(
      eq(weeks.resolved, false),
      isNotNull(games.externalId),
      gt(games.gameDate, now),
      lte(games.gameDate, horizon),
    ));

  const due = candidates.filter((g) => isDue(g, now));
  if (due.length === 0) return { polled: 0, skipped: false };

  // Budget guard: a month that has run dry should fail quietly rather than
  // throw on every tick.
  try {
    const { used, max } = await fetchUsage();
    if (max > 0 && used + due.length > max - RESERVE_ENTITIES) {
      console.warn(`[odds] Budget guard: ${used}/${max} used, holding back ${due.length} refreshes`);
      return { polled: 0, skipped: true };
    }
  } catch {
    // Usage is advisory; a failed check must not stop the board updating.
  }

  const r = await syncOddsForGames(due);
  console.log(`[odds] Refreshed ${r.games}/${due.length} due games — ${r.lines} lines, ${r.props} props`);
  return { polled: r.games, skipped: false };
}

/**
 * Discovery: give a week's games their SGO eventID so the poller can address
 * them by id from then on. Runs once per week, after the ESPN schedule lands.
 */
export async function discoverWeekEvents(weekId: string): Promise<number> {
  const r = await syncOdds(weekId);
  return r.games;
}

/** Games that have finished but whose markets have not been graded yet. */
export async function gamesAwaitingSettlement(): Promise<Array<{ id: string; externalId: string | null }>> {
  const now = new Date();
  return db.select({ id: games.id, externalId: games.externalId })
    .from(games)
    .innerJoin(weeks, eq(weeks.id, games.weekId))
    .where(and(
      eq(weeks.resolved, false),
      isNotNull(games.externalId),
      isNull(games.oddsSettledAt),
      lte(games.gameDate, now),
    ));
}
