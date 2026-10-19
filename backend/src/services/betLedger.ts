import { and, eq, gte, inArray, sql } from "drizzle-orm";
import { games, gameLines, gamePicks, memberships, parlayLegs, parlays, picks, props } from "../db/schema";
import { HttpError } from "../middleware/errorHandler";

// Every balance change a bet makes goes through here, inside the route's
// transaction, so concurrent bets from one member can't overdraw.

type Tx = any;

// Row lock on the member. Serialises that member's bet placements, so checks
// made after this hold at commit.
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
  // Balance is checked in the UPDATE itself, so an overdraw matches no row.
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

// Bets toward maxBetsPerWeek: picks, game picks, and each parlay touching the
// week once. Pass the placement tx so it's read under the lock.
export async function countWeekBets(q: Tx, userId: string, leagueId: string, weekId: string): Promise<number> {
  // picks: join prop -> game where game.weekId = weekId
  const weekPickRows = await q
    .select({ id: picks.id })
    .from(picks)
    .innerJoin(props, eq(picks.propId, props.id))
    .innerJoin(games, eq(props.gameId, games.id))
    .where(and(eq(picks.userId, userId), eq(picks.leagueId, leagueId), eq(games.weekId, weekId)));

  // gamePicks: join gameLine -> game where game.weekId = weekId
  const weekGamePickRows = await q
    .select({ id: gamePicks.id })
    .from(gamePicks)
    .innerJoin(gameLines, eq(gamePicks.gameLineId, gameLines.id))
    .innerJoin(games, eq(gameLines.gameId, games.id))
    .where(and(eq(gamePicks.userId, userId), eq(gamePicks.leagueId, leagueId), eq(games.weekId, weekId)));

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
