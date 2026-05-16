import { Router } from "express";
import { prisma } from "../db/prisma";
import { requireAuth } from "../middleware/auth";
import { calcProfit } from "../lib/payout";

const router = Router();

const STAT_STEP: Record<string, number> = {
  PASSING_YARDS: 5, RUSHING_YARDS: 5, RECEIVING_YARDS: 5,
  TOUCHDOWNS: 0.5, RECEPTIONS: 0.5,
};

function calcPropAltOdds(baseOdds: number, baseLine: number, altLine: number, statType: string, direction: string): number {
  const step = STAT_STEP[statType] ?? 0.5;
  const steps = (altLine - baseLine) / step;
  const favSteps = direction === "OVER" ? -steps : steps;
  return Math.max(-500, Math.min(500, baseOdds - Math.round(favSteps * 15)));
}

router.post("/", requireAuth, async (req: any, res: any) => {
  try {
    const { leagueId, propId, direction, stake, altLine } = req.body;
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

    // Rule 2: cannot bet opposite direction while a pending pick exists on same prop
    const oppositeDir = direction === "OVER" ? "UNDER" : "OVER";
    const pendingOpposite = await prisma.pick.findFirst({ where: { userId, leagueId, propId, direction: oppositeDir, outcome: "PENDING" } });
    if (pendingOpposite) { res.status(409).json({ error: "You have an active bet on the opposite side — cash out first" }); return; }

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

    const effectiveOdds = (altLine != null && prop.line != null)
      ? calcPropAltOdds(prop.odds, prop.line, Number(altLine), prop.statType, direction)
      : prop.odds;

    const [pick] = await prisma.$transaction([
      prisma.pick.create({
        data: {
          userId, leagueId, propId, direction, stake: Number(stake),
          odds: effectiveOdds,
          altLine: altLine != null ? Number(altLine) : null,
        },
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
