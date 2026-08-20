import { and, asc, eq, gte, lte } from "drizzle-orm";
import { db } from "../db/db";
import { leagues, memberships, users, weeks } from "../db/schema";
import { generateAbbreviation } from "./abbreviation";
import { pickHelmetColor } from "./helmetColor";
import { scheduleMatchups } from "./scheduleMatchups";
import { claimSeat, releaseSeat } from "./leagueSeats";
import { isUniqueViolation } from "../db/pgErrors";

/**
 * Seat a user in a league, atomically.
 *
 * The one place an ACTIVE membership is created. It exists because "join a
 * league" is two writes that must not come apart — take the seat, then create
 * the membership — and every join path used to open-code both, with a plain
 * capacity SELECT in front that raced.
 *
 * Order matters: **claim the seat first**. Claiming and then failing to insert
 * leaks one seat until the next recount, which is recoverable. Inserting and
 * then failing to claim would have already put an extra member in a full
 * league, which is not — the round-robin scheduler assumes the roster fits.
 */

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

export async function joinLeague(
  userId: string,
  league: JoinableLeague,
  opts: { isPublicFill?: boolean } = {}
): Promise<JoinOutcome> {
  const isPublicFill = !!opts.isPublicFill;

  const seat = await claimSeat(league.id, { isPublicFill });
  if (!seat.ok) return { ok: false, reason: seat.reason };

  try {
    // Balance is only funded if a week this league actually plays is already
    // live; joining before kickoff starts you at zero and the allowance run
    // tops you up. Read after the seat is secured — it is not part of the race
    // and doing it first would widen the window for nothing.
    const maxWeek = league.startWeek + league.regularSeasonWeeks + league.playoffWeeks - 1;
    const [activeWeek, user] = await Promise.all([
      db.query.weeks.findFirst({
        where: and(eq(weeks.resolved, false), gte(weeks.number, league.startWeek), lte(weeks.number, maxWeek)),
        orderBy: (w, { asc: a }) => [a(w.number)],
      }),
      db.query.users.findFirst({ where: eq(users.id, userId) }),
    ]);
    // Per-league identity seeded from the account defaults set in My Account.
    // Null on either falls through to the old behaviour — generated initials and
    // a random unused colour — so an account that never touched them is
    // unaffected.
    const helmetColor = await pickHelmetColor(league.id, user?.defaultHelmetColor);
    const abbreviation = user?.defaultAbbreviation || generateAbbreviation(user?.displayName ?? "");

    const [membership] = await db.insert(memberships).values({
      userId,
      leagueId: league.id,
      balance: activeWeek ? league.weeklyAllowance : 0,
      status: "ACTIVE",
      isPublicFill,
      helmetColor,
      abbreviation,
      displayName: user?.displayName ?? "",
    }).returning();

    await scheduleMatchups(league.id);
    return { ok: true, membership };
  } catch (err: any) {
    // Give the seat back before rethrowing — otherwise a duplicate join or a
    // transient failure permanently shrinks the league by one.
    await releaseSeat(league.id, { isPublicFill });
    // The Membership (userId, leagueId) unique index. Two things had to be
    // true for this branch to work: the index has to exist (it did not until
    // now, so a double join silently created two rows), and the code has to be
    // read through Drizzle's error wrapper — see db/pgErrors.
    if (isUniqueViolation(err)) return { ok: false, reason: "DUPLICATE" };
    throw err;
  }
}

/**
 * Promote a PENDING request to ACTIVE — the commissioner-approval path.
 *
 * A queued request holds no seat (that is the point of a queue), so approval
 * has to claim one, and can therefore fail: a league that filled while a
 * request sat in the queue cannot accept it. The membership row already
 * exists, so this updates rather than inserts, and hands the seat back if the
 * row has since vanished.
 */
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
    const helmetColor = await pickHelmetColor(league.id, user?.defaultHelmetColor);

    const updated = await db.update(memberships)
      .set({
        status: "ACTIVE",
        balance: activeWeek ? league.weeklyAllowance : 0,
        helmetColor,
        abbreviation: user?.defaultAbbreviation || generateAbbreviation(user?.displayName ?? ""),
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
