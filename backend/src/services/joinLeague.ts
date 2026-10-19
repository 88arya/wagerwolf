import { and, eq, gte, lte } from "drizzle-orm";
import { db } from "../db/db";
import { memberships, users, weeks } from "../db/schema";
import { resolveLeagueIdentity } from "./leagueIdentity";
import { scheduleMatchups } from "./scheduleMatchups";
import { claimSeat, releaseSeat } from "./leagueSeats";
import { isUniqueViolation } from "../db/pgErrors";

export type JoinOutcome =
  | { ok: true; membership: typeof memberships.$inferSelect }
  | { ok: false; reason: "FULL" | "NO_PUBLIC_SLOTS" | "MISSING" | "DUPLICATE" };

type JoinableLeague = {
  id: string;
  weeklyAllowance: number;
  startWeek: number;
  regularSeasonWeeks: number;
  playoffWeeks: number;
};

// The only place an ACTIVE membership is created. Claim the seat before
// inserting: a leaked seat can be recounted, an over-full league can't.
export async function joinLeague(
  userId: string,
  league: JoinableLeague,
  opts: { isPublicFill?: boolean } = {}
): Promise<JoinOutcome> {
  const isPublicFill = !!opts.isPublicFill;

  const seat = await claimSeat(league.id, { isPublicFill });
  if (!seat.ok) return { ok: false, reason: seat.reason };

  try {
    const maxWeek = league.startWeek + league.regularSeasonWeeks + league.playoffWeeks - 1;
    const [activeWeek, user] = await Promise.all([
      db.query.weeks.findFirst({
        where: and(eq(weeks.resolved, false), gte(weeks.number, league.startWeek), lte(weeks.number, maxWeek)),
        orderBy: (w, { asc: a }) => [a(w.number)],
      }),
      db.query.users.findFirst({ where: eq(users.id, userId) }),
    ]);
    const identity = await resolveLeagueIdentity(league.id, user);

    const [membership] = await db.insert(memberships).values({
      userId,
      leagueId: league.id,
      balance: activeWeek ? league.weeklyAllowance : 0,
      status: "ACTIVE",
      isPublicFill,
      ...identity,
    }).returning();

    await scheduleMatchups(league.id);
    return { ok: true, membership };
  } catch (err) {
    await releaseSeat(league.id, { isPublicFill });
    // Unique (userId, leagueId).
    if (isUniqueViolation(err)) return { ok: false, reason: "DUPLICATE" };
    throw err;
  }
}

// Pending requests hold no seat, so approval has to claim one and can fail.
export async function approvePendingMembership(
  userId: string,
  league: JoinableLeague
): Promise<JoinOutcome> {
  const seat = await claimSeat(league.id);
  if (!seat.ok) return { ok: false, reason: seat.reason };

  try {
    const maxWeek = league.startWeek + league.regularSeasonWeeks + league.playoffWeeks - 1;
    const [activeWeek, user] = await Promise.all([
      db.query.weeks.findFirst({
        where: and(eq(weeks.resolved, false), gte(weeks.number, league.startWeek), lte(weeks.number, maxWeek)),
        orderBy: (w, { asc: a }) => [a(w.number)],
      }),
      db.query.users.findFirst({ where: eq(users.id, userId) }),
    ]);
    const identity = await resolveLeagueIdentity(league.id, user);

    const updated = await db.update(memberships)
      .set({
        status: "ACTIVE",
        balance: activeWeek ? league.weeklyAllowance : 0,
        ...identity,
      })
      .where(and(
        eq(memberships.userId, userId),
        eq(memberships.leagueId, league.id),
        eq(memberships.status, "PENDING"),
      ))
      .returning();

    if (updated.length === 0) {
      await releaseSeat(league.id);
      return { ok: false, reason: "MISSING" };
    }

    await scheduleMatchups(league.id);
    return { ok: true, membership: updated[0] };
  } catch (err) {
    await releaseSeat(league.id);
    throw err;
  }
}
