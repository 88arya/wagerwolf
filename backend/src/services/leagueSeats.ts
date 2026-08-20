import { and, eq, sql } from "drizzle-orm";
import { db } from "../db/db";
import { leagues, memberships } from "../db/schema";

/**
 * Seat accounting for a league.
 *
 * `League.activeMemberCount` / `activePublicFillCount` are denormalized counts
 * of ACTIVE memberships, and this module is the only thing allowed to move
 * them. Two jobs, and the second is why they exist at all:
 *
 *  1. Discovery filters on "has room". Without a counter that means loading
 *     every candidate league's memberships to count them, which is what made
 *     the old directory query fan out across the whole table.
 *
 *  2. **They are the lock.** Joining used to be read-count → check-capacity →
 *     insert. Two people taking the last seat both read the same count, both
 *     passed the check, and both inserted — an 11th member in a 10-team league,
 *     which breaks round-robin scheduling. `claimSeat` collapses the check and
 *     the increment into one conditional UPDATE, so exactly one of them wins.
 *
 * The counters are a cache, and a cache can drift — a crash between claiming a
 * seat and inserting the membership leaks one. `recountSeats` is the repair,
 * and the truth is always the `Membership` rows, never the counter.
 */

export type SeatClaim =
  | { ok: true; seatsTaken: number }
  | { ok: false; reason: "FULL" | "NO_PUBLIC_SLOTS" | "MISSING" };

/**
 * Reserve one seat, or fail. Never blocks: the row lock is held for the
 * duration of a single UPDATE.
 *
 * `isPublicFill` is a stranger taking one of a private league's reserved open
 * slots, which is a second, tighter cap — both are asserted in the same
 * statement so a stranger cannot slip past the public limit either.
 *
 * Returning no row is the interesting case: the league filled between the
 * caller deciding to join and this running. That is not an error, it is the
 * race being caught, and callers are expected to move on to another league
 * (matchmaking) or tell the user (a directed join).
 */
export async function claimSeat(leagueId: string, opts: { isPublicFill?: boolean } = {}): Promise<SeatClaim> {
  const isFill = !!opts.isPublicFill;

  const rows = await db
    .update(leagues)
    .set({
      activeMemberCount: sql`${leagues.activeMemberCount} + 1`,
      activePublicFillCount: isFill
        ? sql`${leagues.activePublicFillCount} + 1`
        : leagues.activePublicFillCount,
    })
    .where(
      and(
        eq(leagues.id, leagueId),
        // The capacity assertions. Column-to-column, evaluated against the row
        // as locked by this UPDATE — which is exactly what makes this safe and
        // a separate SELECT unsafe.
        sql`${leagues.activeMemberCount} < ${leagues.maxPlayers}`,
        isFill
          ? sql`${leagues.activePublicFillCount} < ${leagues.maxPublicPlayers}`
          : sql`true`,
        // A started league takes nobody, however much room it has on paper.
        eq(leagues.seasonStarted, false)
      )
    )
    .returning({
      seatsTaken: leagues.activeMemberCount,
      fill: leagues.activePublicFillCount,
      max: leagues.maxPlayers,
      maxFill: leagues.maxPublicPlayers,
    });

  if (rows.length > 0) return { ok: true, seatsTaken: rows[0].seatsTaken };

  // No row updated. Read back to say *why*, so the caller can produce a
  // message that is true rather than a generic "couldn't join".
  const [league] = await db
    .select({
      activeMemberCount: leagues.activeMemberCount,
      maxPlayers: leagues.maxPlayers,
      activePublicFillCount: leagues.activePublicFillCount,
      maxPublicPlayers: leagues.maxPublicPlayers,
    })
    .from(leagues)
    .where(eq(leagues.id, leagueId))
    .limit(1);

  if (!league) return { ok: false, reason: "MISSING" };
  if (league.activeMemberCount >= league.maxPlayers) return { ok: false, reason: "FULL" };
  if (isFill && league.activePublicFillCount >= league.maxPublicPlayers) {
    return { ok: false, reason: "NO_PUBLIC_SLOTS" };
  }
  // Season started, or the row moved again underneath us. FULL is the honest
  // summary for a caller that just wants to try elsewhere.
  return { ok: false, reason: "FULL" };
}

/**
 * Hand a seat back — a member left, was removed, or the membership insert
 * failed after the seat was claimed.
 *
 * Clamped at zero: a double release is a bug, but a *negative* count would let
 * a full league accept members forever, which is far worse than one seat lost
 * until the next recount.
 */
export async function releaseSeat(leagueId: string, opts: { isPublicFill?: boolean } = {}): Promise<void> {
  const isFill = !!opts.isPublicFill;
  await db
    .update(leagues)
    .set({
      activeMemberCount: sql`GREATEST(0, ${leagues.activeMemberCount} - 1)`,
      activePublicFillCount: isFill
        ? sql`GREATEST(0, ${leagues.activePublicFillCount} - 1)`
        : leagues.activePublicFillCount,
    })
    .where(eq(leagues.id, leagueId));
}

/**
 * Recompute both counters from the `Membership` rows.
 *
 * The repair path, and the backfill. Call it after any bulk membership change
 * that did not go through claim/release (a league wipe, a seed script, a
 * migration), or when a count is suspected of having drifted.
 */
export async function recountSeats(leagueId: string): Promise<{ active: number; fill: number }> {
  const [counts] = await db
    .select({
      active: sql<number>`count(*) filter (where ${memberships.status} = 'ACTIVE')::int`,
      fill: sql<number>`count(*) filter (where ${memberships.status} = 'ACTIVE' and ${memberships.isPublicFill})::int`,
    })
    .from(memberships)
    .where(eq(memberships.leagueId, leagueId));

  const active = counts?.active ?? 0;
  const fill = counts?.fill ?? 0;

  await db
    .update(leagues)
    .set({ activeMemberCount: active, activePublicFillCount: fill })
    .where(eq(leagues.id, leagueId));

  return { active, fill };
}
