import { Router } from "express";
import { prisma } from "../db/prisma";
import { requireAuth } from "../middleware/auth";
import { calcProfit } from "../lib/payout";

const router = Router();

const OPPOSITE: Record<string, string> = {
  MONEYLINE_HOME: "MONEYLINE_AWAY",
  MONEYLINE_AWAY: "MONEYLINE_HOME",
  SPREAD_HOME: "SPREAD_AWAY",
  SPREAD_AWAY: "SPREAD_HOME",
  TOTAL_OVER: "TOTAL_UNDER",
  TOTAL_UNDER: "TOTAL_OVER",
};

router.post("/", requireAuth, async (req: any, res: any) => {
  try {
    const { leagueId, gameLineId, stake } = req.body;
    const userId = req.userId;

    if (!leagueId || !gameLineId || stake == null) {
      res.status(400).json({ error: "leagueId, gameLineId, and stake are required" });
      return;
    }
    if (Number(stake) <= 0) {
      res.status(400).json({ error: "Stake must be greater than 0" });
      return;
    }

    const gameLine = await prisma.gameLine.findUnique({
      where: { id: gameLineId },
      include: { game: { include: { week: true } } },
    }) as any;

    if (!gameLine) { res.status(404).json({ error: "Game line not found" }); return; }
    if (gameLine.game.status === "CANCELLED") { res.status(400).json({ error: "This game has been cancelled" }); return; }
    if (gameLine.game.week.locked) { res.status(400).json({ error: "This week is locked" }); return; }
    if (gameLine.game.week.resolved) { res.status(400).json({ error: "This week is already resolved" }); return; }

    // Per-game kickoff lock
    if (new Date(gameLine.game.gameDate) <= new Date()) {
      res.status(400).json({ error: "This game has already kicked off — bets are locked" }); return;
    }

    const membership = await prisma.membership.findUnique({
      where: { userId_leagueId: { userId, leagueId } },
    });
    if (!membership) { res.status(404).json({ error: "Not a member of this league" }); return; }
    if (membership.balance < Number(stake)) {
      res.status(400).json({ error: "Insufficient balance" });
      return;
    }

    const league = await prisma.league.findUnique({ where: { id: leagueId }, select: { maxStakePerBet: true, maxBetsPerWeek: true } });
    if (league?.maxStakePerBet && Number(stake) > league.maxStakePerBet) {
      res.status(400).json({ error: `Max stake per bet is $${league.maxStakePerBet}` }); return;
    }
    if (league?.maxBetsPerWeek) {
      const [weekPicks, weekGamePicks] = await Promise.all([
        prisma.pick.count({ where: { userId, leagueId, prop: { game: { weekId: gameLine.game.weekId } } } }),
        prisma.gamePick.count({ where: { userId, leagueId, gameLine: { game: { weekId: gameLine.game.weekId } } } }),
      ]);
      if (weekPicks + weekGamePicks >= league.maxBetsPerWeek) {
        res.status(400).json({ error: `Maximum ${league.maxBetsPerWeek} bets per week` }); return;
      }
    }

    const existing = await prisma.gamePick.findUnique({
      where: { userId_leagueId_gameLineId: { userId, leagueId, gameLineId } },
    });
    if (existing) { res.status(409).json({ error: "Already placed a bet on this line" }); return; }

    // Anti-arbitrage: check for opposite market on same game
    const oppositeMarket = OPPOSITE[gameLine.market];
    if (oppositeMarket) {
      const opposingLine = await prisma.gameLine.findUnique({
        where: { gameId_market: { gameId: gameLine.gameId, market: oppositeMarket } },
      });
      if (opposingLine) {
        const oppositePick = await prisma.gamePick.findUnique({
          where: { userId_leagueId_gameLineId: { userId, leagueId, gameLineId: opposingLine.id } },
        });
        if (oppositePick) {
          res.status(409).json({ error: `Cannot bet both ${gameLine.market} and ${oppositeMarket} on the same game` });
          return;
        }
      }
    }

    const [gamePick] = await prisma.$transaction([
      prisma.gamePick.create({
        data: { userId, leagueId, gameLineId, stake: Number(stake), odds: gameLine.odds },
      }),
      prisma.membership.update({
        where: { userId_leagueId: { userId, leagueId } },
        data: { balance: { decrement: Number(stake) } },
      }),
    ]);

    res.status(201).json(gamePick);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/", requireAuth, async (req: any, res: any) => {
  try {
    const { leagueId } = req.query;

    const gamePicks = await prisma.gamePick.findMany({
      where: {
        userId: req.userId,
        ...(leagueId ? { leagueId: String(leagueId) } : {}),
      },
      include: {
        gameLine: { include: { game: { include: { week: true } } } },
      },
      orderBy: { createdAt: "desc" },
    });

    res.json(gamePicks);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Cashout a pending game pick before kickoff — full stake refund
router.post("/:id/cashout", requireAuth, async (req: any, res: any) => {
  try {
    const gp = await prisma.gamePick.findUnique({
      where: { id: req.params.id },
      include: { gameLine: { include: { game: true } } },
    }) as any;

    if (!gp) { res.status(404).json({ error: "Game pick not found" }); return; }
    if (gp.userId !== req.userId) { res.status(403).json({ error: "Not your pick" }); return; }
    if (gp.outcome !== "PENDING") { res.status(400).json({ error: "Can only cash out pending bets" }); return; }
    if (gp.cashedOut) { res.status(400).json({ error: "Already cashed out" }); return; }
    if (new Date(gp.gameLine.game.gameDate) <= new Date()) {
      res.status(400).json({ error: "Cannot cash out after game has started" }); return;
    }

    await prisma.$transaction([
      prisma.gamePick.update({ where: { id: gp.id }, data: { outcome: "VOID", cashedOut: true } }),
      prisma.membership.updateMany({
        where: { userId: gp.userId, leagueId: gp.leagueId },
        data: { balance: { increment: gp.stake } },
      }),
    ]);

    res.json({ message: "Cashed out", refunded: gp.stake });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Internal helper for resolution
export async function settleGamePick(gamePickId: string) {
  const gp = await prisma.gamePick.findUnique({
    where: { id: gamePickId },
    include: { gameLine: true },
  }) as any;
  if (!gp || gp.outcome !== "PENDING" || gp.gameLine.result == null) return;

  const won = gp.gameLine.result === true;
  const profit = won ? calcProfit(gp.stake, gp.odds) : 0;

  await prisma.$transaction([
    prisma.gamePick.update({ where: { id: gp.id }, data: { outcome: won ? "WIN" : "LOSS" } }),
    prisma.membership.updateMany({
      where: { userId: gp.userId, leagueId: gp.leagueId },
      data: won
        ? { balance: { increment: gp.stake + profit }, weeklyWinnings: { increment: profit } }
        : { weeklyWinnings: { decrement: gp.stake } },
    }),
  ]);
}

export default router;
