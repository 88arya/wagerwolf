import { Router } from "express";
import { db } from "../db/db";
import { eq, and, inArray, count, sql } from "drizzle-orm";
import { gamePicks, gameLines, games, memberships, leagues, picks, props } from "../db/schema";
import { requireAuth } from "../middleware/auth";
import { betLimiter } from "../middleware/rateLimit";
import { calcProfit, fmtMoney } from "../lib/payout";

const router = Router();

const OPPOSITE: Record<string, string> = {
  MONEYLINE_HOME: "MONEYLINE_AWAY",
  MONEYLINE_AWAY: "MONEYLINE_HOME",
  SPREAD_HOME: "SPREAD_AWAY",
  SPREAD_AWAY: "SPREAD_HOME",
  TOTAL_OVER: "TOTAL_UNDER",
  TOTAL_UNDER: "TOTAL_OVER",
};

function calcGameLineAltOdds(baseOdds: number, baseLine: number, altLine: number, market: string): number {
  const steps = (altLine - baseLine) / 0.5;
  const favSteps = market === "TOTAL_OVER" ? -steps : steps;
  return Math.max(-500, Math.min(500, baseOdds - Math.round(favSteps * 15)));
}

router.post("/", requireAuth, betLimiter, async (req: any, res: any) => {
  try {
    const { leagueId, gameLineId, stake, altLine } = req.body;
    const userId = req.userId;

    if (!leagueId || !gameLineId || stake == null) {
      res.status(400).json({ error: "leagueId, gameLineId, and stake are required" });
      return;
    }
    if (Number(stake) <= 0 || !Number.isInteger(Number(stake))) {
      res.status(400).json({ error: "Stake must be a whole number of cents greater than 0" });
      return;
    }

    const gameLine = await db.query.gameLines.findFirst({
      where: eq(gameLines.id, gameLineId),
      with: { game: { with: { week: true } } },
    }) as any;

    if (!gameLine) { res.status(404).json({ error: "Game line not found" }); return; }
    if (gameLine.game.status === "CANCELLED") { res.status(400).json({ error: "This game has been cancelled" }); return; }
    if (gameLine.game.week.locked) { res.status(400).json({ error: "This week is locked" }); return; }
    if (gameLine.game.week.resolved) { res.status(400).json({ error: "This week is already resolved" }); return; }

    // Per-game kickoff lock
    if (new Date(gameLine.game.gameDate) <= new Date()) {
      res.status(400).json({ error: "This game has already kicked off — bets are locked" }); return;
    }

    const [membership] = await db.select().from(memberships)
      .where(and(eq(memberships.userId, userId), eq(memberships.leagueId, leagueId)))
      .limit(1);
    if (!membership) { res.status(404).json({ error: "Not a member of this league" }); return; }
    if (membership.balance < Number(stake)) {
      res.status(400).json({ error: "Insufficient balance" });
      return;
    }

    const [league] = await db.select({
      maxStakePerBet: leagues.maxStakePerBet,
      maxBetsPerWeek: leagues.maxBetsPerWeek,
    }).from(leagues).where(eq(leagues.id, leagueId)).limit(1);

    if (league?.maxStakePerBet && Number(stake) > league.maxStakePerBet) {
      res.status(400).json({ error: `Max stake per bet is ${fmtMoney(league.maxStakePerBet)}` }); return;
    }
    if (league?.maxBetsPerWeek) {
      // Get all game IDs for this week
      const weekGames = await db.select({ id: games.id })
        .from(games)
        .where(eq(games.weekId, gameLine.game.weekId));
      const weekGameIds = weekGames.map((g: any) => g.id);

      // Get all prop IDs for games in this week
      const weekProps = weekGameIds.length > 0
        ? await db.select({ id: props.id }).from(props).where(inArray(props.gameId, weekGameIds))
        : [];
      const weekPropIds = weekProps.map((p: any) => p.id);

      // Get all game line IDs for games in this week
      const weekGameLines = weekGameIds.length > 0
        ? await db.select({ id: gameLines.id }).from(gameLines).where(inArray(gameLines.gameId, weekGameIds))
        : [];
      const weekGameLineIds = weekGameLines.map((gl: any) => gl.id);

      const [{ value: weekPickCount }] = await db.select({ value: count() })
        .from(picks)
        .where(and(
          eq(picks.userId, userId),
          eq(picks.leagueId, leagueId),
          weekPropIds.length > 0 ? inArray(picks.propId, weekPropIds) : sql`false`,
        ));
      const [{ value: weekGamePickCount }] = await db.select({ value: count() })
        .from(gamePicks)
        .where(and(
          eq(gamePicks.userId, userId),
          eq(gamePicks.leagueId, leagueId),
          weekGameLineIds.length > 0 ? inArray(gamePicks.gameLineId, weekGameLineIds) : sql`false`,
        ));

      if (weekPickCount + weekGamePickCount >= league.maxBetsPerWeek) {
        res.status(400).json({ error: `Maximum ${league.maxBetsPerWeek} bets per week` }); return;
      }
    }

    // Alt line only valid for spread/total markets
    if (altLine != null && gameLine.market.startsWith("MONEYLINE")) {
      res.status(400).json({ error: "Cannot rotate line on moneylines" }); return;
    }

    // Anti-arbitrage: check for opposite market on same game
    const oppositeMarket = OPPOSITE[gameLine.market];
    if (oppositeMarket) {
      const [opposingLine] = await db.select().from(gameLines)
        .where(and(eq(gameLines.gameId, gameLine.gameId), eq(gameLines.market, oppositeMarket)))
        .limit(1);
      if (opposingLine) {
        const oppositePick = await db.query.gamePicks.findFirst({
          where: and(
            eq(gamePicks.userId, userId),
            eq(gamePicks.leagueId, leagueId),
            eq(gamePicks.gameLineId, opposingLine.id),
            eq(gamePicks.outcome, "PENDING"),
          ),
        });
        if (oppositePick) {
          res.status(409).json({ error: `Cannot bet both ${gameLine.market} and ${oppositeMarket} on the same game` });
          return;
        }
      }
    }

    const effectiveOdds = (altLine != null && gameLine.line != null)
      ? calcGameLineAltOdds(gameLine.odds, gameLine.line, Number(altLine), gameLine.market)
      : gameLine.odds;

    const [gamePick] = await db.insert(gamePicks).values({
      userId, leagueId, gameLineId, stake: Number(stake),
      odds: effectiveOdds,
      altLine: altLine != null ? Number(altLine) : null,
    }).returning();

    await db.update(memberships)
      .set({ balance: sql`${memberships.balance} - ${Number(stake)}` })
      .where(and(eq(memberships.userId, userId), eq(memberships.leagueId, leagueId)));

    res.status(201).json(gamePick);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/", requireAuth, async (req: any, res: any) => {
  try {
    const { leagueId } = req.query;

    const whereClause = leagueId
      ? and(eq(gamePicks.userId, req.userId), eq(gamePicks.leagueId, String(leagueId)))
      : eq(gamePicks.userId, req.userId);

    const rows = await db.query.gamePicks.findMany({
      where: whereClause,
      with: { gameLine: { with: { game: { with: { week: true } } } } },
      orderBy: (gamePicks, { desc }) => [desc(gamePicks.createdAt)],
    });

    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Cashout a pending game pick before kickoff — full stake refund
router.post("/:id/cashout", requireAuth, betLimiter, async (req: any, res: any) => {
  try {
    const gp = await db.query.gamePicks.findFirst({
      where: eq(gamePicks.id, req.params.id),
      with: { gameLine: { with: { game: true } } },
    }) as any;

    if (!gp) { res.status(404).json({ error: "Game pick not found" }); return; }
    if (gp.userId !== req.userId) { res.status(403).json({ error: "Not your pick" }); return; }
    if (gp.outcome !== "PENDING") { res.status(400).json({ error: "Can only cash out pending bets" }); return; }
    if (gp.cashedOut) { res.status(400).json({ error: "Already cashed out" }); return; }
    if (new Date(gp.gameLine.game.gameDate) <= new Date()) {
      res.status(400).json({ error: "Cannot cash out after game has started" }); return;
    }

    await db.update(gamePicks)
      .set({ outcome: "VOID", cashedOut: true })
      .where(eq(gamePicks.id, gp.id));

    await db.update(memberships)
      .set({ balance: sql`${memberships.balance} + ${gp.stake}` })
      .where(and(eq(memberships.userId, gp.userId), eq(memberships.leagueId, gp.leagueId)));

    res.json({ message: "Cashed out", refunded: gp.stake });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Internal helper for resolution
export async function settleGamePick(gamePickId: string) {
  const gp = await db.query.gamePicks.findFirst({
    where: eq(gamePicks.id, gamePickId),
    with: { gameLine: { with: { game: true } } },
  }) as any;
  if (!gp || gp.outcome !== "PENDING") return;

  let won: boolean;
  if (gp.altLine != null) {
    const { homeScore, awayScore } = gp.gameLine.game;
    if (homeScore == null || awayScore == null) return;
    switch (gp.gameLine.market) {
      case "SPREAD_HOME": won = (homeScore + gp.altLine) > awayScore; break;
      case "SPREAD_AWAY": won = (awayScore + gp.altLine) > homeScore; break;
      case "TOTAL_OVER":  won = (homeScore + awayScore) > gp.altLine; break;
      case "TOTAL_UNDER": won = (homeScore + awayScore) < gp.altLine; break;
      default: if (gp.gameLine.result == null) return; won = gp.gameLine.result; break;
    }
  } else {
    if (gp.gameLine.result == null) return;
    won = gp.gameLine.result === true;
  }
  const profit = won ? calcProfit(gp.stake, gp.odds) : 0;

  await db.update(gamePicks)
    .set({ outcome: won ? "WIN" : "LOSS" })
    .where(eq(gamePicks.id, gp.id));

  if (won) {
    await db.update(memberships)
      .set({
        balance: sql`${memberships.balance} + ${gp.stake + profit}`,
        weeklyWinnings: sql`${memberships.weeklyWinnings} + ${profit}`,
      })
      .where(and(eq(memberships.userId, gp.userId), eq(memberships.leagueId, gp.leagueId)));
  } else {
    await db.update(memberships)
      .set({ weeklyWinnings: sql`${memberships.weeklyWinnings} - ${gp.stake}` })
      .where(and(eq(memberships.userId, gp.userId), eq(memberships.leagueId, gp.leagueId)));
  }
}

export default router;
