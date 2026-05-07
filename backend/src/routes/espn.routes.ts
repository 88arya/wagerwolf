import { Router } from "express";
import { StatType } from "@prisma/client";
import { prisma } from "../db/prisma";
import { requireAuth, requireAdmin } from "../middleware/auth";
import { getNFLWeekGames, getGameStats } from "../services/espnApi";

const router = Router();

const STAT_FIELD: Record<StatType, keyof Awaited<ReturnType<typeof getGameStats>> extends Map<string, infer V> ? V : never> = {
  PASSING_YARDS: "passingYards",
  RUSHING_YARDS: "rushingYards",
  RECEIVING_YARDS: "receivingYards",
  RECEPTIONS: "receptions",
  TOUCHDOWNS: "touchdowns",
} as any;

// Sync ESPN games into a week
router.post("/games/:weekId", requireAuth, requireAdmin, async (req: any, res: any) => {
  try {
    const week = await prisma.week.findUnique({ where: { id: req.params.weekId } });
    if (!week) { res.status(404).json({ error: "Week not found" }); return; }

    const espnGames = await getNFLWeekGames(new Date(week.startDate), week.number);

    const created = [];
    for (const g of espnGames) {
      const game = await prisma.game.upsert({
        where: { espnId: g.espnId },
        update: {},
        create: {
          weekId: week.id,
          homeTeam: g.homeTeam,
          awayTeam: g.awayTeam,
          gameDate: g.gameDate,
          espnId: g.espnId,
        },
      });
      created.push(game);
    }

    res.json({ synced: created.length, games: created });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Auto-resolve a week using ESPN box scores
router.post("/resolve/:weekId", requireAuth, requireAdmin, async (req: any, res: any) => {
  try {
    const { weekId } = req.params;
    const week = await prisma.week.findUnique({
      where: { id: weekId },
      include: { games: { include: { props: { include: { player: true } } } } },
    }) as any;

    if (!week) { res.status(404).json({ error: "Week not found" }); return; }
    if (week.resolved) { res.status(400).json({ error: "Week already resolved" }); return; }

    // Gather player stats from ESPN for every game that has an espnId
    const masterStats = new Map<string, ReturnType<typeof Object.fromEntries>>();
    for (const game of week.games) {
      if (!game.espnId) continue;
      const gameStats = await getGameStats(game.espnId);
      for (const [name, stats] of gameStats) {
        masterStats.set(name.toLowerCase(), stats);
      }
    }

    // Set prop results by matching player names (case-insensitive)
    let matched = 0;
    let unmatched = 0;
    for (const game of week.games) {
      for (const prop of game.props) {
        if (prop.result != null) continue;
        const playerStats = masterStats.get(prop.player.name.toLowerCase());
        if (!playerStats) { unmatched++; continue; }

        const statKey = STAT_FIELD[prop.statType as StatType];
        const result = (playerStats as any)[statKey] ?? null;
        if (result == null) { unmatched++; continue; }

        await prisma.prop.update({ where: { id: prop.id }, data: { result } });
        matched++;
      }
    }

    // Resolve picks
    const picks = await prisma.pick.findMany({
      where: { outcome: "PENDING", prop: { game: { weekId } } },
      include: { prop: true },
    }) as any[];

    for (const pick of picks) {
      const { result } = pick.prop;
      if (result == null) continue;

      const won =
        (pick.direction === "OVER" && result > pick.prop.line) ||
        (pick.direction === "UNDER" && result < pick.prop.line);

      await prisma.pick.update({ where: { id: pick.id }, data: { outcome: won ? "WIN" : "LOSS" } });

      if (won) {
        await prisma.membership.updateMany({
          where: { userId: pick.userId, leagueId: pick.leagueId },
          data: { balance: { increment: pick.stake * 2 } },
        });
      }
    }

    // Floor negative balances
    await prisma.membership.updateMany({ where: { balance: { lt: 0 } }, data: { balance: 0 } });

    // Mark week resolved
    await prisma.week.update({ where: { id: weekId }, data: { resolved: true, locked: true } });

    // Resolve matchups
    const allPicks = await prisma.pick.findMany({
      where: { prop: { game: { weekId } } },
      select: { userId: true, leagueId: true, stake: true, outcome: true },
    });
    const profitMap: Record<string, number> = {};
    for (const p of allPicks) {
      const key = `${p.userId}:${p.leagueId}`;
      if (!profitMap[key]) profitMap[key] = 0;
      if (p.outcome === "WIN") profitMap[key] += Number(p.stake);
      else if (p.outcome === "LOSS") profitMap[key] -= Number(p.stake);
    }
    const matchups = await prisma.matchup.findMany({
      where: { weekNumber: week.number, winnerId: null, isTie: false },
    }) as any[];
    for (const matchup of matchups) {
      const homeProfit = profitMap[`${matchup.homeUserId}:${matchup.leagueId}`] ?? 0;
      const awayProfit = profitMap[`${matchup.awayUserId}:${matchup.leagueId}`] ?? 0;
      const isTie = homeProfit === awayProfit;
      const winnerId = isTie ? null : homeProfit > awayProfit ? matchup.homeUserId : matchup.awayUserId;
      await prisma.matchup.update({ where: { id: matchup.id }, data: { homeProfit, awayProfit, winnerId, isTie } });
    }

    res.json({ message: "Week auto-resolved", propsMatched: matched, propsUnmatched: unmatched });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
