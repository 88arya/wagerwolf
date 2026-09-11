import { db } from "../db/db";
import { players } from "../db/schema";
import { eq, isNull, inArray, sql } from "drizzle-orm";
import { searchEspnPlayerId, getAthleteDetails, espnImageUrl } from "./espnApi";

/**
 * Resolving a player's ESPN identity — headshot, jersey, position.
 *
 * THIS USED TO EXIST ONLY INSIDE `GET /players/:id/image`, and that was the
 * bug. `espnId` was written in exactly one place in the codebase: a view-time
 * request handler behind `requireAuth`. So a player's identity was resolved the
 * first time a signed-in user happened to look at them, and never otherwise.
 *
 * WHAT THAT BROKE, concretely. The landing page's marquee draws prop cards, and
 * `propSample` in services/publicMarkets.ts requires `Player.espnId IS NOT
 * NULL` because every prop card carries a headshot and a card with a missing
 * face reads as a failure rather than a variant. The marquee exists to sell the
 * product to someone who has NOT signed in — so on a fresh deployment it could
 * never show a single prop, because the only thing that could populate the
 * field was a signed-in user browsing the bet board. Measured on production
 * after the first odds sync: 307 players, 1,072 props, and **zero** eligible
 * prop cards. The chicken had to sign in before the egg could be sold to it.
 *
 * THE FIX IS TO RESOLVE IDENTITY WHEN THE PLAYER ARRIVES, not when someone
 * looks at them. Players are created by the odds sync (services/syncWeek.ts),
 * so that is where this is called from; the route now delegates here so the two
 * paths cannot drift.
 *
 * The lazy path is kept, and deliberately. Backfill is best-effort — ESPN's
 * search is a name match and misses people — so the route remains the
 * second chance for anyone the sweep could not resolve.
 */

/** How many ESPN lookups run at once. */
const CONCURRENCY = 4;

/**
 * The per-player work, extracted verbatim from the route so both callers behave
 * identically.
 *
 * Returns null when ESPN cannot identify the player at all — a name the search
 * does not match. That is an ordinary outcome, not an error: the feed prices
 * players ESPN has no page for, and the caller should skip them rather than
 * retry forever.
 */
export async function resolvePlayerIdentity(player: {
  id: string;
  name: string;
  team: string | null;
  espnId: string | null;
  jersey: string | null;
  // NOT nullable: `Player.position` is `.notNull()` in the schema. It carries a
  // guess from the market the player was first seen in until ESPN corrects it.
  position: string;
}): Promise<{ espnId: string; jersey: string | null; position: string } | null> {
  // Team disambiguates same-name players — see searchEspnPlayerId.
  const espnId = player.espnId ?? (await searchEspnPlayerId(player.name, player.team));
  if (!espnId) return null;

  // ESPN OWNS THE POSITION. What the row arrives with is a guess made from the
  // market it was first seen in (POSITION_HINT in services/syncWeek.ts), and
  // that guess is wrong for anyone appearing outside their own position — a
  // quarterback with a rushing-yards prop is filed as RB if the rushing market
  // happens to come first in the feed's array.
  //
  // The `!jersey` guard is what keeps this to one request per player. The
  // jersey is only ever written here, so an empty one means "never resolved",
  // and once both are filled nothing re-fetches.
  let jersey = player.jersey;
  let position: string = player.position;
  if (!jersey || position === "FLEX") {
    const details = await getAthleteDetails(espnId);
    jersey = jersey ?? details.jersey;
    if (details.position) position = details.position;
  }

  if (espnId !== player.espnId || jersey !== player.jersey || position !== player.position) {
    await db.update(players)
      .set({ espnId, imageUrl: espnImageUrl(espnId), jersey, position })
      .where(eq(players.id, player.id));
  }
  return { espnId, jersey, position };
}

/**
 * Resolve every player who still has no `espnId`.
 *
 * SCOPED TO PLAYERS MISSING ONE, so this is cheap to call often and converges
 * rather than re-fetching. A player ESPN cannot match stays null and is
 * retried on the next sweep — which is the right trade at this volume, and is
 * why `limit` exists: one sweep should not spend minutes on names that will
 * never resolve.
 *
 * BOUNDED CONCURRENCY because ESPN's endpoints are undocumented and unmetered,
 * which is precisely the reason not to open 300 sockets at them. Four at a time
 * clears a full NFL week in well under a minute.
 *
 * NEVER THROWS. It is called from the odds sync, and a headshot that cannot be
 * resolved must not fail a sync that has already written the week's board.
 */
export async function backfillPlayerIdentities(
  opts: { limit?: number; playerIds?: string[] } = {},
): Promise<{ scanned: number; resolved: number; unresolved: number }> {
  const limit = opts.limit ?? 500;

  const rows = await db.select()
    .from(players)
    .where(
      opts.playerIds?.length
        ? sql`${players.espnId} IS NULL AND ${inArray(players.id, opts.playerIds)}`
        : isNull(players.espnId),
    )
    .limit(limit);

  if (rows.length === 0) return { scanned: 0, resolved: 0, unresolved: 0 };

  let resolved = 0;
  let cursor = 0;
  async function worker() {
    for (;;) {
      const i = cursor++;
      if (i >= rows.length) return;
      try {
        if (await resolvePlayerIdentity(rows[i] as any)) resolved++;
      } catch {
        // One unreachable player must not stop the sweep.
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, rows.length) }, worker));

  return { scanned: rows.length, resolved, unresolved: rows.length - resolved };
}
