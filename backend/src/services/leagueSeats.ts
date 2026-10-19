import { and, eq, sql } from "drizzle-orm";
import { db } from "../db/db";
import { leagues, memberships } from "../db/schema";

// activeMemberCount / activePublicFillCount are a denormalized cache of ACTIVE
// memberships, and claimSeat is the lock that stops two people taking the last
// seat. Membership rows are the source of truth; recountSeats repairs drift.

export type SeatClaim =
  | { ok: true; seatsTaken: number }
  | { ok: false; reason: "FULL" | "NO_PUBLIC_SLOTS" | "MISSING" };

// Check and increment in one conditional UPDATE, so exactly one concurrent
// joiner wins. No row back means the league filled first.
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
  return { ok: false, reason: "FULL" };
}

// Clamped at zero: a negative count would let a full league accept members forever.
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
