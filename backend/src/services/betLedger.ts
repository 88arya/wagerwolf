import { and, eq, gte, inArray, sql } from "drizzle-orm";
import { games, gameLines, gamePicks, memberships, parlayLegs, parlays, picks, props } from "../db/schema";
import { HttpError } from "../middleware/errorHandler";

/**
 * Every balance movement a bet route makes goes through here, inside the
 * route's transaction.
 *
 * Placement used to read the balance, run its checks, insert the bet and then
 * decrement, as separate statements outside any transaction. Two bets placed
 * at once both passed the balance check and both debited, so the balance went
 * negative; the same gap let `maxBetsPerWeek` and the opposite-side rule be
 * raced. `lockMembership` takes a row lock on the member for the length of the
 * transaction, which serialises one member's bet placements against each other
 * and makes every check made after it true at commit.
 *
 * `debitStake` is conditional as well, the same shape as `claimSeat`: the
 * balance is compared in the UPDATE itself, so a debit that would overdraw
 * matches no row and fails rather than trusting an earlier read.
 */

type Tx = any;

export async function lockMembership(tx: Tx, userId: string, leagueId: string) {
  const [membership] = await tx.select().from(memberships)
    .where(and(eq(memberships.userId, userId), eq(memberships.leagueId, leagueId)))
    .limit(1)
    .for("update");
  if (!membership) throw new HttpError(404, "Not a member of this league");
  return membership;
}

export async function debitStake(
  tx: Tx,
  userId: string,
  leagueId: string,
  amount: number,
  message = "Insufficient balance",
) {
  const rows = await tx.update(memberships)
    .set({ balance: sql`${memberships.balance} - ${amount}` })
    .where(and(
      eq(memberships.userId, userId),
      eq(memberships.leagueId, leagueId),
      gte(memberships.balance, amount),
    ))
    .returning({ id: memberships.id });
  if (rows.length === 0) throw new HttpError(400, message);
}

export async function creditStake(tx: Tx, userId: string, leagueId: string, amount: number) {
  await tx.update(memberships)
    .set({ balance: sql`${memberships.balance} + ${amount}` })
    .where(and(eq(memberships.userId, userId), eq(memberships.leagueId, leagueId)));
}

/**
 * One member's bets in one week, for `maxBetsPerWeek`: picks, game picks, and
 * each parlay with a leg in the week once. Pass the placement transaction, so
 * the count is read under `lockMembership`.
 *
 * The single-bet routes used to count picks and game picks only, while the
 * parlay routes and the "bets this week" figure counted parlays too, so a
 * member at the cap through parlays could keep placing straight bets. All
 * three routes share this now.
 */
export async function countWeekBets(q: Tx, userId: string, leagueId: string, weekId: string): Promise<number> {
  // picks: join prop → game where game.weekId = weekId
  const weekPickRows = await q
    .select({ id: picks.id })
    .from(picks)
    .innerJoin(props, eq(picks.propId, props.id))
    .innerJoin(games, eq(props.gameId, games.id))
    .where(and(eq(picks.userId, userId), eq(picks.leagueId, leagueId), eq(games.weekId, weekId)));

  // gamePicks: join gameLine → game where game.weekId = weekId
  const weekGamePickRows = await q
    .select({ id: gamePicks.id })
    .from(gamePicks)
    .innerJoin(gameLines, eq(gamePicks.gameLineId, gameLines.id))
    .innerJoin(games, eq(gameLines.gameId, games.id))
    .where(and(eq(gamePicks.userId, userId), eq(gamePicks.leagueId, leagueId), eq(games.weekId, weekId)));

  // parlays: a parlay counts if it has at least one leg touching this week
  // find parlayIds for this user+league, then check if any of their legs touch this week
  const userParlayRows = await q
    .select({ id: parlays.id })
    .from(parlays)
    .where(and(eq(parlays.userId, userId), eq(parlays.leagueId, leagueId)));

  let weekParlayCount = 0;
  if (userParlayRows.length > 0) {
    const parlayIds = userParlayRows.map((p: any) => p.id);
    // legs via props
    const legViaPropRows = await q
      .select({ parlayId: parlayLegs.parlayId })
      .from(parlayLegs)
      .innerJoin(props, eq(parlayLegs.propId, props.id))
      .innerJoin(games, eq(props.gameId, games.id))
      .where(and(inArray(parlayLegs.parlayId, parlayIds), eq(games.weekId, weekId)));
    // legs via gameLines
    const legViaGLRows = await q
      .select({ parlayId: parlayLegs.parlayId })
      .from(parlayLegs)
      .innerJoin(gameLines, eq(parlayLegs.gameLineId, gameLines.id))
      .innerJoin(games, eq(gameLines.gameId, games.id))
      .where(and(inArray(parlayLegs.parlayId, parlayIds), eq(games.weekId, weekId)));

    const touchingParlayIds = new Set<string>();
    for (const r of legViaPropRows) touchingParlayIds.add(r.parlayId);
    for (const r of legViaGLRows) touchingParlayIds.add(r.parlayId);
    weekParlayCount = touchingParlayIds.size;
  }

  return weekPickRows.length + weekGamePickRows.length + weekParlayCount;
}
