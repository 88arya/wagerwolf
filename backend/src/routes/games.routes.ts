import { Router } from "express";
import { db } from "../db/db";
import { eq, inArray, and } from "drizzle-orm";
import { games, picks, gameLines, gamePicks, parlayLegs, parlays, memberships } from "../db/schema";
import { requireAuth, requireCron } from "../middleware/auth";

const router = Router();

router.post("/", requireAuth, requireCron, async (req: any, res: any) => {
  try {
    const { weekId, homeTeam, awayTeam, gameDate } = req.body;
    if (!weekId || !homeTeam || !awayTeam || !gameDate) {
      res.status(400).json({ error: "weekId, homeTeam, awayTeam, and gameDate are required" });
      return;
    }
    const [game] = await db.insert(games).values({ weekId, homeTeam, awayTeam, gameDate: new Date(gameDate) }).returning();
    res.status(201).json(game);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Cancel a game — voids all pending bets and refunds stakes
router.post("/:id/cancel", requireAuth, requireCron, async (req: any, res: any) => {
  try {
    const game = await db.query.games.findFirst({
      where: eq(games.id, req.params.id),
      with: { props: true, gameLines: true },
    });
    if (!game) { res.status(404).json({ error: "Game not found" }); return; }
    if (game.status === "CANCELLED") { res.status(400).json({ error: "Game already cancelled" }); return; }

    await db.update(games).set({ status: "CANCELLED" }).where(eq(games.id, game.id));

    const propIds = game.props.map((p) => p.id);
    const gameLineIds = game.gameLines.map((gl) => gl.id);

    // Void + refund pending prop picks
    const pendingPicks = propIds.length
      ? await db.select().from(picks).where(and(inArray(picks.propId, propIds), eq(picks.outcome, "PENDING")))
      : [];
    for (const pick of pendingPicks) {
      await db.update(picks).set({ outcome: "VOID" }).where(eq(picks.id, pick.id));
      const [mem] = await db.select().from(memberships)
        .where(and(eq(memberships.userId, pick.userId), eq(memberships.leagueId, pick.leagueId)))
        .limit(1);
      if (mem) {
        await db.update(memberships)
          .set({ balance: mem.balance + pick.stake })
          .where(and(eq(memberships.userId, pick.userId), eq(memberships.leagueId, pick.leagueId)));
      }
    }

    // Void + refund pending game picks
    const pendingGamePicks = gameLineIds.length
      ? await db.select().from(gamePicks).where(and(inArray(gamePicks.gameLineId, gameLineIds), eq(gamePicks.outcome, "PENDING")))
      : [];
    for (const gp of pendingGamePicks) {
      await db.update(gamePicks).set({ outcome: "VOID" }).where(eq(gamePicks.id, gp.id));
      const [mem] = await db.select().from(memberships)
        .where(and(eq(memberships.userId, gp.userId), eq(memberships.leagueId, gp.leagueId)))
        .limit(1);
      if (mem) {
        await db.update(memberships)
          .set({ balance: mem.balance + gp.stake })
          .where(and(eq(memberships.userId, gp.userId), eq(memberships.leagueId, gp.leagueId)));
      }
    }

    // Void parlays that have legs on this game and refund stakes
    const [legsProp, legsLine] = await Promise.all([
      propIds.length
        ? db.select().from(parlayLegs).where(and(inArray(parlayLegs.propId, propIds), eq(parlayLegs.outcome, "PENDING")))
        : Promise.resolve([]),
      gameLineIds.length
        ? db.select().from(parlayLegs).where(and(inArray(parlayLegs.gameLineId, gameLineIds), eq(parlayLegs.outcome, "PENDING")))
        : Promise.resolve([]),
    ]);
    const affectedParlayIds = new Set([...legsProp.map((l) => l.parlayId), ...legsLine.map((l) => l.parlayId)]);

    for (const parlayId of affectedParlayIds) {
      const [parlay] = await db.select().from(parlays).where(eq(parlays.id, parlayId)).limit(1);
      if (!parlay || parlay.outcome !== "PENDING") continue;

      if (propIds.length) {
        await db.update(parlayLegs)
          .set({ outcome: "VOID" })
          .where(and(eq(parlayLegs.parlayId, parlayId), inArray(parlayLegs.propId, propIds)));
      }
      if (gameLineIds.length) {
        await db.update(parlayLegs)
          .set({ outcome: "VOID" })
          .where(and(eq(parlayLegs.parlayId, parlayId), inArray(parlayLegs.gameLineId, gameLineIds)));
      }
      await db.update(parlays).set({ outcome: "VOID" }).where(eq(parlays.id, parlayId));
      const [mem] = await db.select().from(memberships)
        .where(and(eq(memberships.userId, parlay.userId), eq(memberships.leagueId, parlay.leagueId)))
        .limit(1);
      if (mem) {
        await db.update(memberships)
          .set({ balance: mem.balance + parlay.stake })
          .where(and(eq(memberships.userId, parlay.userId), eq(memberships.leagueId, parlay.leagueId)));
      }
    }

    res.json({
      message: "Game cancelled — all bets voided and stakes refunded",
      picksVoided: pendingPicks.length,
      gamePicksVoided: pendingGamePicks.length,
      parlaysVoided: affectedParlayIds.size,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
