import { Router } from "express";
import { db } from "../db/db";
import { eq, and } from "drizzle-orm";
import { gamePicks, gameLines, leagues } from "../db/schema";
import { requireAuth } from "../middleware/auth";
import { betLimiter } from "../middleware/rateLimit";
import { fmtMoney } from "../lib/payout";
import { lockMembership, debitStake, creditStake, countWeekBets } from "../services/betLedger";
import { HttpError } from "../middleware/errorHandler";

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

router.post("/", requireAuth, betLimiter, async (req: any, res: any, next: any) => {
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

    // Alt line only valid for spread/total markets
    if (altLine != null && gameLine.market.startsWith("MONEYLINE")) {
      res.status(400).json({ error: "Cannot rotate line on moneylines" }); return;
    }

    // One transaction, holding a lock on the member, so concurrent bets see
    // each other's debits and counts. See services/betLedger.ts.
    const gamePick = await db.transaction(async (tx) => {
      const membership = await lockMembership(tx, userId, leagueId);
      if (membership.balance < Number(stake)) throw new HttpError(400, "Insufficient balance");

      const [league] = await tx.select({
        maxStakePerBet: leagues.maxStakePerBet,
        maxBetsPerWeek: leagues.maxBetsPerWeek,
      }).from(leagues).where(eq(leagues.id, leagueId)).limit(1);

      if (league?.maxStakePerBet && Number(stake) > league.maxStakePerBet) {
        throw new HttpError(400, `Max stake per bet is ${fmtMoney(league.maxStakePerBet)}`);
      }
      if (league?.maxBetsPerWeek) {
        const weekBets = await countWeekBets(tx, userId, leagueId, gameLine.game.weekId);
        if (weekBets >= league.maxBetsPerWeek) {
          throw new HttpError(400, `Maximum ${league.maxBetsPerWeek} bets per week`);
        }
      }

      // Anti-arbitrage: check for opposite market on same game
      const oppositeMarket = OPPOSITE[gameLine.market];
      if (oppositeMarket) {
        const [opposingLine] = await tx.select().from(gameLines)
          .where(and(eq(gameLines.gameId, gameLine.gameId), eq(gameLines.market, oppositeMarket)))
          .limit(1);
        if (opposingLine) {
          const oppositePick = await tx.query.gamePicks.findFirst({
            where: and(
              eq(gamePicks.userId, userId),
              eq(gamePicks.leagueId, leagueId),
              eq(gamePicks.gameLineId, opposingLine.id),
              eq(gamePicks.outcome, "PENDING"),
            ),
          });
          if (oppositePick) {
            throw new HttpError(409, `Cannot bet both ${gameLine.market} and ${oppositeMarket} on the same game`);
          }
        }
      }

      const effectiveOdds = (altLine != null && gameLine.line != null)
        ? calcGameLineAltOdds(gameLine.odds, gameLine.line, Number(altLine), gameLine.market)
        : gameLine.odds;

      const [created] = await tx.insert(gamePicks).values({
        userId, leagueId, gameLineId, stake: Number(stake),
        odds: effectiveOdds,
        altLine: altLine != null ? Number(altLine) : null,
      }).returning();

      await debitStake(tx, userId, leagueId, Number(stake));
      return created;
    });

    res.status(201).json(gamePick);
  } catch (err: any) {
    next(err); return;
  }
});

router.get("/", requireAuth, async (req: any, res: any, next: any) => {
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
    next(err); return;
  }
});

// Cashout a pending game pick before kickoff — full stake refund
router.post("/:id/cashout", requireAuth, betLimiter, async (req: any, res: any, next: any) => {
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

    // The checks above are a fast path; this conditional UPDATE is the guard,
    // so two concurrent cashouts refund the stake once. See picks.routes.ts.
    await db.transaction(async (tx) => {
      const claimed = await tx.update(gamePicks)
        .set({ outcome: "VOID", cashedOut: true })
        .where(and(eq(gamePicks.id, gp.id), eq(gamePicks.outcome, "PENDING"), eq(gamePicks.cashedOut, false)))
        .returning({ id: gamePicks.id });
      if (claimed.length === 0) throw new HttpError(400, "Already cashed out");

      await creditStake(tx, gp.userId, gp.leagueId, gp.stake);
    });

    res.json({ message: "Cashed out", refunded: gp.stake });
  } catch (err: any) {
    next(err); return;
  }
});

export default router;
