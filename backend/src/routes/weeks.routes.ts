import { Router } from "express";
import { prisma } from "../db/prisma";
import { requireAuth, requireCron } from "../middleware/auth";
import { calcProfit } from "../lib/payout";

const router = Router();

router.get("/", requireAuth, async (req: any, res: any) => {
  try {
    const { current, leagueId } = req.query;

    if (current === "true") {
      if (leagueId) {
        const league = await prisma.league.findUnique({ where: { id: String(leagueId) } });
        if (!league) { res.status(404).json({ error: "League not found" }); return; }
        const maxWeek = league.startWeek + league.regularSeasonWeeks + league.playoffWeeks - 1;
        const rangeFilter = { resolved: false, number: { gte: league.startWeek, lte: maxWeek } };
        const include = { games: { include: { props: { include: { player: true } }, gameLines: true } } };
        const now = new Date();

        let week = await prisma.week.findFirst({
          where: { ...rangeFilter, startDate: { lte: now }, endDate: { gte: now } },
          orderBy: { number: "asc" },
          include,
        });
        if (!week) {
          week = await prisma.week.findFirst({
            where: { ...rangeFilter, startDate: { gt: now } },
            orderBy: { startDate: "asc" },
            include,
          });
        }
        if (!week) {
          week = await prisma.week.findFirst({ where: rangeFilter, orderBy: { number: "asc" }, include });
        }
        res.json(week ? [week] : []);
        return;
      }

      const now = new Date();
      let week = await prisma.week.findFirst({
        where: { resolved: false, startDate: { lte: now }, endDate: { gte: now } },
        orderBy: { number: "asc" },
        include: { games: { include: { props: { include: { player: true } }, gameLines: true } } },
      });
      if (!week) {
        week = await prisma.week.findFirst({
          where: { resolved: false, startDate: { gt: now } },
          orderBy: { startDate: "asc" },
          include: { games: { include: { props: { include: { player: true } }, gameLines: true } } },
        });
      }
      if (!week) {
        week = await prisma.week.findFirst({
          where: { resolved: false },
          orderBy: { number: "asc" },
          include: { games: { include: { props: { include: { player: true } }, gameLines: true } } },
        });
      }
      res.json(week ? [week] : []);
      return;
    }

    const weeks = await prisma.week.findMany({
      orderBy: { number: "desc" },
      include: { games: { include: { props: { include: { player: true } }, gameLines: true } } },
    });
    res.json(weeks);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/:id", requireAuth, async (req: any, res: any) => {
  try {
    const week = await prisma.week.findUnique({
      where: { id: req.params.id },
      include: { games: { include: { props: { include: { player: true } }, gameLines: true } } },
    });
    if (!week) { res.status(404).json({ error: "Week not found" }); return; }
    res.json(week);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.delete("/:id", requireAuth, requireCron, async (req: any, res: any) => {
  try {
    const week = await prisma.week.findUnique({ where: { id: req.params.id }, include: { games: true } });
    if (!week) { res.status(404).json({ error: "Week not found" }); return; }

    const gameIds = week.games.map((g) => g.id);
    await prisma.parlayLeg.deleteMany({ where: { prop: { gameId: { in: gameIds } } } });
    await prisma.parlayLeg.deleteMany({ where: { gameLine: { gameId: { in: gameIds } } } });
    await prisma.pick.deleteMany({ where: { prop: { gameId: { in: gameIds } } } });
    await prisma.gamePick.deleteMany({ where: { gameLine: { gameId: { in: gameIds } } } });
    await prisma.prop.deleteMany({ where: { gameId: { in: gameIds } } });
    await prisma.gameLine.deleteMany({ where: { gameId: { in: gameIds } } });
    await prisma.game.deleteMany({ where: { id: { in: gameIds } } });
    await prisma.week.delete({ where: { id: req.params.id } });

    res.json({ message: "Week deleted" });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/:id/lock", requireAuth, requireCron, async (req: any, res: any) => {
  try {
    const week = await prisma.week.findUnique({ where: { id: req.params.id } });
    if (!week) { res.status(404).json({ error: "Week not found" }); return; }
    if (week.resolved) { res.status(400).json({ error: "Week already resolved" }); return; }
    const updated = await prisma.week.update({
      where: { id: req.params.id },
      data: { locked: !week.locked },
    });
    res.json(updated);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Manual fallback resolve (for when ESPN data is unavailable)
router.post("/:id/resolve", requireAuth, requireCron, async (req: any, res: any) => {
  try {
    const { id: weekId } = req.params;
    const { results, gameLineResults } = req.body as {
      results: { propId: string; result: number }[];
      gameLineResults?: { gameLineId: string; result: boolean }[];
    };

    const week = await prisma.week.findUnique({ where: { id: weekId } });
    if (!week) { res.status(404).json({ error: "Week not found" }); return; }
    if (week.resolved) { res.status(400).json({ error: "Week already resolved" }); return; }

    for (const { propId, result } of results) {
      await prisma.prop.update({ where: { id: propId }, data: { result } });
    }
    if (gameLineResults) {
      for (const { gameLineId, result } of gameLineResults) {
        await prisma.gameLine.update({ where: { id: gameLineId }, data: { result } });
      }
    }

    const picks = await prisma.pick.findMany({
      where: { outcome: "PENDING", prop: { game: { weekId } } },
      include: { prop: true },
    }) as any[];

    for (const pick of picks) {
      const { result } = pick.prop;
      if (result === null) continue;
      const effectiveLine = pick.altLine ?? pick.prop.line;
      const won = (pick.direction === "OVER" && result > effectiveLine) ||
                  (pick.direction === "UNDER" && result < effectiveLine);
      const profit = won ? calcProfit(Number(pick.stake), pick.odds) : 0;
      await prisma.$transaction([
        prisma.pick.update({ where: { id: pick.id }, data: { outcome: won ? "WIN" : "LOSS" } }),
        prisma.membership.updateMany({
          where: { userId: pick.userId, leagueId: pick.leagueId },
          data: won
            ? { balance: { increment: Number(pick.stake) + profit }, weeklyWinnings: { increment: profit } }
            : { weeklyWinnings: { decrement: Number(pick.stake) } },
        }),
      ]);
    }

    const gamePicks = await prisma.gamePick.findMany({
      where: { outcome: "PENDING", gameLine: { game: { weekId } } },
      include: { gameLine: { include: { game: true } } },
    }) as any[];

    for (const gp of gamePicks) {
      let won: boolean;
      if (gp.gameLine.result == null) continue;
      won = gp.gameLine.result === true;
      const profit = won ? calcProfit(Number(gp.stake), gp.odds) : 0;
      await prisma.$transaction([
        prisma.gamePick.update({ where: { id: gp.id }, data: { outcome: won ? "WIN" : "LOSS" } }),
        prisma.membership.updateMany({
          where: { userId: gp.userId, leagueId: gp.leagueId },
          data: won
            ? { balance: { increment: Number(gp.stake) + profit }, weeklyWinnings: { increment: profit } }
            : { weeklyWinnings: { decrement: Number(gp.stake) } },
        }),
      ]);
    }

    await prisma.membership.updateMany({ where: { balance: { lt: 0 } }, data: { balance: 0 } });
    await prisma.week.update({ where: { id: weekId }, data: { resolved: true, locked: true } });

    const matchups = await prisma.matchup.findMany({
      where: { weekNumber: week.number, winnerId: null, isTie: false },
    }) as any[];

    for (const matchup of matchups) {
      const [homeMem, awayMem] = await Promise.all([
        prisma.membership.findUnique({ where: { userId_leagueId: { userId: matchup.homeUserId, leagueId: matchup.leagueId } } }),
        prisma.membership.findUnique({ where: { userId_leagueId: { userId: matchup.awayUserId, leagueId: matchup.leagueId } } }),
      ]);
      const homeProfit = homeMem?.weeklyWinnings ?? 0;
      const awayProfit = awayMem?.weeklyWinnings ?? 0;
      const isTie = homeProfit === awayProfit;
      const winnerId = isTie ? null : homeProfit > awayProfit ? matchup.homeUserId : matchup.awayUserId;
      await prisma.matchup.update({ where: { id: matchup.id }, data: { homeProfit, awayProfit, winnerId, isTie } });
    }

    res.json({ message: "Week resolved", weekId });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
