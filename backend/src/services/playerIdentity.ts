import { db } from "../db/db";
import { players } from "../db/schema";
import { eq, isNull, inArray, sql } from "drizzle-orm";
import { searchEspnPlayerId, getAthleteDetails, espnImageUrl } from "./espnApi";
import { invalidateAllMarkets } from "./weekBoard";

// Resolves ESPN id, jersey and position. Run by the odds sync when players are
// created; the image route is a fallback for anyone it missed.

/** How many ESPN lookups run at once. */
const CONCURRENCY = 4;

export async function resolvePlayerIdentity(player: {
  id: string;
  name: string;
  team: string | null;
  espnId: string | null;
  jersey: string | null;
  position: string;
}): Promise<{ espnId: string; jersey: string | null; position: string } | null> {
  // Team disambiguates same-name players - see searchEspnPlayerId.
  const espnId = player.espnId ?? (await searchEspnPlayerId(player.name, player.team));
  if (!espnId) return null;

  // ESPN's position overrides our guess from the markets.
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

// Players with no espnId, 4 at a time. Never throws, since it runs inside the sync.
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
  if (resolved > 0) invalidateAllMarkets();

  return { scanned: rows.length, resolved, unresolved: rows.length - resolved };
}
