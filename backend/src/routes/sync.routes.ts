import { Router } from "express";
import { StatType } from "@prisma/client";
import { prisma } from "../db/prisma";
import { requireAuth, requireAdmin } from "../middleware/auth";
import { getNFLWeekData } from "../services/oddsApi";

const router = Router();

const MARKET_TO_STAT: Record<string, StatType> = {
  passing_yards: StatType.PASSING_YARDS,
  passing_touchdowns: StatType.TOUCHDOWNS,
  rushing_yards: StatType.RUSHING_YARDS,
  receiving_yards: StatType.RECEIVING_YARDS,
  receptions: StatType.RECEPTIONS,
};

const MARKET_TO_POSITION: Record<string, string> = {
  passing_yards: "QB",
  passing_touchdowns: "QB",
  rushing_yards: "RB",
  receiving_yards: "WR",
  receptions: "WR",
};

// Sync all games, lines, and props for a week in one API call
router.post("/week/:weekId", requireAuth, requireAdmin, async (req: any, res: any) => {
  try {
    const week = await prisma.week.findUnique({ where: { id: req.params.weekId } });
    if (!week) { res.status(404).json({ error: "Week not found" }); return; }

    const allData = await getNFLWeekData();
    const start = new Date(week.startDate);
    const end = new Date(week.endDate);

    const inRange = allData.filter(({ commenceTime }) => {
      const d = new Date(commenceTime);
      return d >= start && d <= end;
    });

    let gamesSynced = 0, linesSynced = 0, propsSynced = 0;

    for (const { eventId, commenceTime, homeTeam, awayTeam, lines, props } of inRange) {
      const game = await prisma.game.upsert({
        where: { externalId: eventId },
        update: { homeTeam, awayTeam, gameDate: new Date(commenceTime) },
        create: { weekId: week.id, homeTeam, awayTeam, gameDate: new Date(commenceTime), externalId: eventId },
      });
      gamesSynced++;

      for (const raw of lines) {
        await prisma.gameLine.upsert({
          where: { gameId_market: { gameId: game.id, market: raw.market } },
          update: { label: raw.label, odds: raw.odds, line: raw.line },
          create: { gameId: game.id, market: raw.market, label: raw.label, odds: raw.odds, line: raw.line },
        });
        linesSynced++;
      }

      for (const raw of props) {
        const statType = MARKET_TO_STAT[raw.market];
        if (!statType) continue;

        let player = await prisma.player.findFirst({ where: { name: raw.playerName } });
        if (!player) {
          player = await prisma.player.create({
            data: { name: raw.playerName, team: "", position: MARKET_TO_POSITION[raw.market] ?? "FLEX" },
          });
        }

        const existing = await prisma.prop.findFirst({
          where: { gameId: game.id, playerId: player.id, statType },
        });

        if (existing) {
          await prisma.prop.update({ where: { id: existing.id }, data: { line: raw.line } });
        } else {
          await prisma.prop.create({
            data: { gameId: game.id, playerId: player.id, statType, line: raw.line },
          });
        }
        propsSynced++;
      }
    }

    res.json({ games: gamesSynced, lines: linesSynced, props: propsSynced });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
