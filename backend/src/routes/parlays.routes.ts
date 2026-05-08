import { Router } from "express";
import { prisma } from "../db/prisma";
import { requireAuth } from "../middleware/auth";
import { calcParlayOdds, calcParlayPayout } from "../lib/payout";

const router = Router();

const OPPOSITE: Record<string, string> = {
  MONEYLINE_HOME: "MONEYLINE_AWAY",
  MONEYLINE_AWAY: "MONEYLINE_HOME",
  SPREAD_HOME: "SPREAD_AWAY",
  SPREAD_AWAY: "SPREAD_HOME",
  TOTAL_OVER: "TOTAL_UNDER",
  TOTAL_UNDER: "TOTAL_OVER",
};

interface LegInput {
  propId?: string;
  gameLineId?: string;
  direction?: "OVER" | "UNDER";
}

router.post("/", requireAuth, async (req: any, res: any) => {
  try {
    const { leagueId, stake, legs } = req.body as {
      leagueId: string;
      stake: number;
      legs: LegInput[];
    };
    const userId = req.userId;

    if (!leagueId || !stake || !legs || legs.length < 2) {
      res.status(400).json({ error: "leagueId, stake, and at least 2 legs are required" });
      return;
    }
    if (Number(stake) <= 0) {
      res.status(400).json({ error: "Stake must be greater than 0" });
      return;
    }

    const membership = await prisma.membership.findUnique({
      where: { userId_leagueId: { userId, leagueId } },
    });
    if (!membership) { res.status(404).json({ error: "Not a member of this league" }); return; }
    if (membership.balance < Number(stake)) {
      res.status(400).json({ error: "Insufficient balance" });
      return;
    }

    // Validate each leg and collect odds
    const resolvedLegs: Array<{ propId?: string; gameLineId?: string; direction?: string; odds: number }> = [];
    const seenPropIds = new Set<string>();
    const seenGameLineIds = new Set<string>();
    const seenGameMarkets = new Map<string, Set<string>>();

    for (const leg of legs) {
      if (!leg.propId && !leg.gameLineId) {
        res.status(400).json({ error: "Each leg must have propId or gameLineId" });
        return;
      }

      if (leg.propId) {
        if (!leg.direction) { res.status(400).json({ error: "Prop legs require a direction" }); return; }

        const prop = await prisma.prop.findUnique({
          where: { id: leg.propId },
          include: { game: { include: { week: true } } },
        }) as any;
        if (!prop) { res.status(404).json({ error: `Prop ${leg.propId} not found` }); return; }
        if (prop.game.status === "CANCELLED") { res.status(400).json({ error: "Cannot include bets on cancelled games in parlay" }); return; }
        if (prop.game.week.locked || prop.game.week.resolved) {
          res.status(400).json({ error: "Cannot include locked/resolved props in parlay" });
          return;
        }
        if (new Date(prop.game.gameDate) <= new Date()) {
          res.status(400).json({ error: `Game has already kicked off — cannot include in parlay` }); return;
        }

        // Anti-arbitrage within legs: no OVER and UNDER on same prop
        const conflictKey = `prop:${leg.propId}`;
        const oppositeDir = leg.direction === "OVER" ? "UNDER" : "OVER";
        if (seenPropIds.has(`${leg.propId}:${oppositeDir}`)) {
          res.status(409).json({ error: "Cannot include both OVER and UNDER on same prop in one parlay" });
          return;
        }
        seenPropIds.add(`${leg.propId}:${leg.direction}`);

        resolvedLegs.push({ propId: leg.propId, direction: leg.direction, odds: prop.odds });
      } else if (leg.gameLineId) {
        const gameLine = await prisma.gameLine.findUnique({
          where: { id: leg.gameLineId },
          include: { game: { include: { week: true } } },
        }) as any;
        if (!gameLine) { res.status(404).json({ error: `GameLine ${leg.gameLineId} not found` }); return; }
        if (gameLine.game.status === "CANCELLED") { res.status(400).json({ error: "Cannot include bets on cancelled games in parlay" }); return; }
        if (gameLine.game.week.locked || gameLine.game.week.resolved) {
          res.status(400).json({ error: "Cannot include locked/resolved game lines in parlay" });
          return;
        }
        if (new Date(gameLine.game.gameDate) <= new Date()) {
          res.status(400).json({ error: `Game has already kicked off — cannot include in parlay` }); return;
        }

        if (seenGameLineIds.has(leg.gameLineId)) {
          res.status(409).json({ error: "Duplicate game line in parlay" });
          return;
        }

        // Anti-arbitrage: no opposite markets in same game
        const gameMarkets = seenGameMarkets.get(gameLine.gameId) ?? new Set<string>();
        const oppositeMarket = OPPOSITE[gameLine.market];
        if (oppositeMarket && gameMarkets.has(oppositeMarket)) {
          res.status(409).json({ error: `Cannot include both ${gameLine.market} and ${oppositeMarket} on same game in one parlay` });
          return;
        }
        gameMarkets.add(gameLine.market);
        seenGameMarkets.set(gameLine.gameId, gameMarkets);
        seenGameLineIds.add(leg.gameLineId);

        resolvedLegs.push({ gameLineId: leg.gameLineId, odds: gameLine.odds });
      }
    }

    const totalOdds = calcParlayOdds(resolvedLegs.map((l) => l.odds));
    const payout = calcParlayPayout(Number(stake), totalOdds);

    const parlay = await prisma.$transaction(async (tx) => {
      const created = await tx.parlay.create({
        data: {
          userId,
          leagueId,
          stake: Number(stake),
          totalOdds,
          payout,
          legs: {
            create: resolvedLegs.map((l) => ({
              propId: l.propId ?? null,
              gameLineId: l.gameLineId ?? null,
              direction: l.direction as any ?? null,
              odds: l.odds,
            })),
          },
        },
        include: { legs: true },
      });

      await tx.membership.update({
        where: { userId_leagueId: { userId, leagueId } },
        data: { balance: { decrement: Number(stake) } },
      });

      return created;
    });

    res.status(201).json(parlay);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Cashout a pending parlay before all games have started — full stake refund
router.post("/:id/cashout", requireAuth, async (req: any, res: any) => {
  try {
    const parlay = await prisma.parlay.findUnique({
      where: { id: req.params.id },
      include: {
        legs: {
          include: {
            prop: { include: { game: true } },
            gameLine: { include: { game: true } },
          },
        },
      },
    }) as any;

    if (!parlay) { res.status(404).json({ error: "Parlay not found" }); return; }
    if (parlay.userId !== req.userId) { res.status(403).json({ error: "Not your parlay" }); return; }
    if (parlay.outcome !== "PENDING") { res.status(400).json({ error: "Can only cash out pending parlays" }); return; }
    if (parlay.cashedOut) { res.status(400).json({ error: "Already cashed out" }); return; }

    // Cashout only if every leg's game hasn't started
    const now = new Date();
    for (const leg of parlay.legs) {
      const game = leg.prop?.game ?? leg.gameLine?.game;
      if (game && new Date(game.gameDate) <= now) {
        res.status(400).json({ error: "Cannot cash out — one or more games have already started" }); return;
      }
    }

    await prisma.$transaction([
      prisma.parlay.update({ where: { id: parlay.id }, data: { outcome: "VOID", cashedOut: true } }),
      prisma.membership.updateMany({
        where: { userId: parlay.userId, leagueId: parlay.leagueId },
        data: { balance: { increment: parlay.stake } },
      }),
    ]);

    res.json({ message: "Cashed out", refunded: parlay.stake });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/", requireAuth, async (req: any, res: any) => {
  try {
    const { leagueId } = req.query;

    const parlays = await prisma.parlay.findMany({
      where: {
        userId: req.userId,
        ...(leagueId ? { leagueId: String(leagueId) } : {}),
      },
      include: {
        legs: {
          include: {
            prop: { include: { player: true, game: { include: { week: true } } } },
            gameLine: { include: { game: { include: { week: true } } } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    res.json(parlays);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
