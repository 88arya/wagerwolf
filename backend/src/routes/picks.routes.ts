import { Router } from "express";
import { prisma } from "../db/prisma";
import { requireAuth } from "../middleware/auth";
import { calcProfit } from "../lib/payout";

const router = Router();

router.post("/", requireAuth, async (req: any, res: any) => {
  try {
    const { leagueId, propId, direction, stake } = req.body;
    const userId = req.userId;

    if (!leagueId || !propId || !direction || stake == null) {
      res.status(400).json({ error: "leagueId, propId, direction, and stake are required" });
      return;
    }
    if (Number(stake) <= 0) {
      res.status(400).json({ error: "Stake must be greater than 0" });
      return;
    }

    const prop = await prisma.prop.findUnique({
      where: { id: propId },
      include: { game: { include: { week: true } } },
    }) as any;

    if (!prop) { res.status(404).json({ error: "Prop not found" }); return; }
    if (prop.game.status === "CANCELLED") { res.status(400).json({ error: "This game has been cancelled" }); return; }
    if (prop.game.week.locked) { res.status(400).json({ error: "This week is locked" }); return; }
    if (prop.game.week.resolved) { res.status(400).json({ error: "This week is already resolved" }); return; }

    // Per-game kickoff lock
    if (new Date(prop.game.gameDate) <= new Date()) {
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
        prisma.pick.count({ where: { userId, leagueId, prop: { game: { weekId: prop.game.weekId } } } }),
        prisma.gamePick.count({ where: { userId, leagueId, gameLine: { game: { weekId: prop.game.weekId } } } }),
      ]);
      if (weekPicks + weekGamePicks >= league.maxBetsPerWeek) {
        res.status(400).json({ error: `Maximum ${league.maxBetsPerWeek} bets per week` }); return;
      }
    }

    const existing = await prisma.pick.findUnique({
      where: { userId_leagueId_propId: { userId, leagueId, propId } },
    });
    if (existing) { res.status(409).json({ error: "Already placed a bet on this prop" }); return; }

    // Anti-arbitrage: cannot bet opposite side of same prop
    const opposite = await prisma.pick.findFirst({
      where: { userId, leagueId, propId, direction: direction === "OVER" ? "UNDER" : "OVER" },
    });
    if (opposite) { res.status(409).json({ error: "Cannot bet both sides of the same prop" }); return; }

    const [pick] = await prisma.$transaction([
      prisma.pick.create({
        data: { userId, leagueId, propId, direction, stake: Number(stake), odds: prop.odds },
      }),
      prisma.membership.update({
        where: { userId_leagueId: { userId, leagueId } },
        data: { balance: { decrement: Number(stake) } },
      }),
    ]);

    res.status(201).json(pick);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/", requireAuth, async (req: any, res: any) => {
  try {
    const { leagueId } = req.query;

    const picks = await prisma.pick.findMany({
      where: {
        userId: req.userId,
        ...(leagueId ? { leagueId: String(leagueId) } : {}),
      },
      include: { prop: { include: { player: true, game: { include: { week: true } } } } },
      orderBy: { createdAt: "desc" },
    });

    res.json(picks);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Cashout a pending prop pick before kickoff — full stake refund
router.post("/:id/cashout", requireAuth, async (req: any, res: any) => {
  try {
    const pick = await prisma.pick.findUnique({
      where: { id: req.params.id },
      include: { prop: { include: { game: true } } },
    }) as any;

    if (!pick) { res.status(404).json({ error: "Pick not found" }); return; }
    if (pick.userId !== req.userId) { res.status(403).json({ error: "Not your pick" }); return; }
    if (pick.outcome !== "PENDING") { res.status(400).json({ error: "Can only cash out pending bets" }); return; }
    if (pick.cashedOut) { res.status(400).json({ error: "Already cashed out" }); return; }
    if (new Date(pick.prop.game.gameDate) <= new Date()) {
      res.status(400).json({ error: "Cannot cash out after game has started" }); return;
    }

    await prisma.$transaction([
      prisma.pick.update({ where: { id: pick.id }, data: { outcome: "VOID", cashedOut: true } }),
      prisma.membership.updateMany({
        where: { userId: pick.userId, leagueId: pick.leagueId },
        data: { balance: { increment: pick.stake } },
      }),
    ]);

    res.json({ message: "Cashed out", refunded: pick.stake });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Internal helper exported for use in resolution routes
export async function settlePick(pickId: string) {
  const pick = await prisma.pick.findUnique({
    where: { id: pickId },
    include: { prop: true },
  }) as any;
  if (!pick || pick.outcome !== "PENDING" || pick.prop.result == null) return;

  const won =
    (pick.direction === "OVER" && pick.prop.result > pick.prop.line) ||
    (pick.direction === "UNDER" && pick.prop.result < pick.prop.line);

  const profit = won ? calcProfit(pick.stake, pick.odds) : 0;

  await prisma.$transaction([
    prisma.pick.update({ where: { id: pick.id }, data: { outcome: won ? "WIN" : "LOSS" } }),
    prisma.membership.updateMany({
      where: { userId: pick.userId, leagueId: pick.leagueId },
      data: won
        ? { balance: { increment: pick.stake + profit }, weeklyWinnings: { increment: profit } }
        : { weeklyWinnings: { decrement: pick.stake } },
    }),
  ]);
}

export default router;
