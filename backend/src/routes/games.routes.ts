import { Router } from "express";
import { prisma } from "../db/prisma";
import { requireAuth, requireCron } from "../middleware/auth";

const router = Router();

router.post("/", requireAuth, requireCron, async (req: any, res: any) => {
  try {
    const { weekId, homeTeam, awayTeam, gameDate } = req.body;
    if (!weekId || !homeTeam || !awayTeam || !gameDate) {
      res.status(400).json({ error: "weekId, homeTeam, awayTeam, and gameDate are required" });
      return;
    }
    const game = await prisma.game.create({
      data: { weekId, homeTeam, awayTeam, gameDate: new Date(gameDate) },
    });
    res.status(201).json(game);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Cancel a game — voids all pending bets and refunds stakes
router.post("/:id/cancel", requireAuth, requireCron, async (req: any, res: any) => {
  try {
    const game = await prisma.game.findUnique({
      where: { id: req.params.id },
      include: { props: true, gameLines: true },
    });
    if (!game) { res.status(404).json({ error: "Game not found" }); return; }
    if (game.status === "CANCELLED") { res.status(400).json({ error: "Game already cancelled" }); return; }

    await prisma.game.update({ where: { id: game.id }, data: { status: "CANCELLED" } });

    const propIds = game.props.map((p) => p.id);
    const gameLineIds = game.gameLines.map((gl) => gl.id);

    // Void + refund pending prop picks
    const picks = await prisma.pick.findMany({
      where: { propId: { in: propIds }, outcome: "PENDING" },
    });
    for (const pick of picks) {
      await prisma.$transaction([
        prisma.pick.update({ where: { id: pick.id }, data: { outcome: "VOID" } }),
        prisma.membership.updateMany({
          where: { userId: pick.userId, leagueId: pick.leagueId },
          data: { balance: { increment: pick.stake } },
        }),
      ]);
    }

    // Void + refund pending game picks
    const gamePicks = await prisma.gamePick.findMany({
      where: { gameLineId: { in: gameLineIds }, outcome: "PENDING" },
    });
    for (const gp of gamePicks) {
      await prisma.$transaction([
        prisma.gamePick.update({ where: { id: gp.id }, data: { outcome: "VOID" } }),
        prisma.membership.updateMany({
          where: { userId: gp.userId, leagueId: gp.leagueId },
          data: { balance: { increment: gp.stake } },
        }),
      ]);
    }

    // Void parlays that have legs on this game and refund stakes
    const [legsProp, legsLine] = await Promise.all([
      prisma.parlayLeg.findMany({ where: { propId: { in: propIds }, outcome: "PENDING" } }),
      prisma.parlayLeg.findMany({ where: { gameLineId: { in: gameLineIds }, outcome: "PENDING" } }),
    ]);
    const affectedParlayIds = new Set([...legsProp.map((l) => l.parlayId), ...legsLine.map((l) => l.parlayId)]);

    for (const parlayId of affectedParlayIds) {
      const parlay = await prisma.parlay.findUnique({ where: { id: parlayId } });
      if (!parlay || parlay.outcome !== "PENDING") continue;

      await prisma.$transaction([
        ...(propIds.length ? [prisma.parlayLeg.updateMany({ where: { parlayId, propId: { in: propIds } }, data: { outcome: "VOID" } })] : []),
        ...(gameLineIds.length ? [prisma.parlayLeg.updateMany({ where: { parlayId, gameLineId: { in: gameLineIds } }, data: { outcome: "VOID" } })] : []),
        prisma.parlay.update({ where: { id: parlayId }, data: { outcome: "VOID" } }),
        prisma.membership.updateMany({
          where: { userId: parlay.userId, leagueId: parlay.leagueId },
          data: { balance: { increment: parlay.stake } },
        }),
      ]);
    }

    res.json({
      message: "Game cancelled — all bets voided and stakes refunded",
      picksVoided: picks.length,
      gamePicksVoided: gamePicks.length,
      parlaysVoided: affectedParlayIds.size,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
