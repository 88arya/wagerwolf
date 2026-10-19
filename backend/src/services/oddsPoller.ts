import { db } from "../db/db";
import { eq, and, lte, gt, isNotNull } from "drizzle-orm";
import { games, weeks } from "../db/schema";
import { syncOddsForGames, syncOdds } from "./syncWeek";
import { fetchUsage } from "./sportsGameOdds";

interface Tier { withinHours: number; everyMinutes: number }

// Refresh cadence by time to kickoff. Polling stops at kickoff, so odds are
// pregame only. Sized to stay around 74% of the 2500 entity/month quota in a
// 5-week month; re-run the simulation in the tests if you change it.
const TIERS: Tier[] = [
  { withinHours: 3,        everyMinutes: 60 },
  { withinHours: 24,       everyMinutes: 180 },
  { withinHours: 72,       everyMinutes: 480 },
  { withinHours: Infinity, everyMinutes: 1440 },
];

export function intervalMinutesFor(hoursToKickoff: number): number {
  for (const t of TIERS) if (hoursToKickoff <= t.withinHours) return t.everyMinutes;
  return TIERS[TIERS.length - 1].everyMinutes;
}

/** Is this game due a refresh right now? */
export function isDue(game: { gameDate: Date; oddsPolledAt: Date | null }, now: Date): boolean {
  const msToKickoff = new Date(game.gameDate).getTime() - now.getTime();
  if (msToKickoff <= 0) return false;              // kicked off - never spend again
  if (!game.oddsPolledAt) return true;             // never polled

  const hoursToKickoff = msToKickoff / 3_600_000;
  const minutesSincePoll = (now.getTime() - new Date(game.oddsPolledAt).getTime()) / 60_000;
  return minutesSincePoll >= intervalMinutesFor(hoursToKickoff);
}

// Headroom kept for settlement, which can't be deferred.
const RESERVE_ENTITIES = 150;

// Only poll the current week; polling every future game would blow the quota.
const POLL_HORIZON_DAYS = 8;

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

// Stamps each game with its SGO event id so later polls can fetch by id.
export async function discoverWeekEvents(weekId: string): Promise<number> {
  const r = await syncOdds(weekId);
  return r.games;
}