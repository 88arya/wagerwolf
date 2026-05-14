import { Router } from "express";
import { StatType } from "@prisma/client";
import { prisma } from "../db/prisma";
import { requireAuth, requireAdmin } from "../middleware/auth";
import { getNFLWeekData } from "../services/oddsApi";
import { seedFakePropsForWeek } from "../services/fakeSync";

const router = Router();

const MARKET_TO_STAT: Record<string, StatType> = {
  passing_yards: StatType.PASSING_YARDS,
  passing_touchdowns: StatType.PASSING_TOUCHDOWNS,
  passing_completions: StatType.PASSING_COMPLETIONS,
  passing_attempts: StatType.PASSING_ATTEMPTS,
  passing_interceptions: StatType.PASSING_INTERCEPTIONS,
  passing_longest: StatType.PASSING_LONGEST,
  rushing_yards: StatType.RUSHING_YARDS,
  rushing_touchdowns: StatType.RUSHING_TOUCHDOWNS,
  rushing_attempts: StatType.RUSHING_ATTEMPTS,
  rushing_longest: StatType.RUSHING_LONGEST,
  receiving_yards: StatType.RECEIVING_YARDS,
  receiving_touchdowns: StatType.RECEIVING_TOUCHDOWNS,
  receiving_longest: StatType.RECEIVING_LONGEST,
  receiving_targets: StatType.RECEIVING_TARGETS,
  receptions: StatType.RECEPTIONS,
  sacks: StatType.SACKS,
  tackles_assists: StatType.TACKLES_ASSISTS,
  interceptions: StatType.DEFENSIVE_INTERCEPTIONS,
  field_goals_made: StatType.FIELD_GOALS_MADE,
  field_goal_longest: StatType.FIELD_GOAL_LONGEST,
  kicking_points: StatType.KICKING_POINTS,
  extra_points_made: StatType.EXTRA_POINTS_MADE,
};

const MARKET_TO_POSITION: Record<string, string> = {
  passing_yards: "QB",
  passing_touchdowns: "QB",
  passing_completions: "QB",
  passing_attempts: "QB",
  passing_interceptions: "QB",
  passing_longest: "QB",
  rushing_yards: "RB",
  rushing_touchdowns: "RB",
  rushing_attempts: "RB",
  rushing_longest: "RB",
  receiving_yards: "WR",
  receiving_touchdowns: "WR",
  receiving_longest: "WR",
  receiving_targets: "WR",
  receptions: "WR",
  sacks: "DE",
  tackles_assists: "LB",
  interceptions: "CB",
  field_goals_made: "K",
  field_goal_longest: "K",
  kicking_points: "K",
  extra_points_made: "K",
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

// Seed fake props + lines using real player names (no SportsGameOdds API required)
router.post("/week/:weekId/fake", requireAuth, requireAdmin, async (req: any, res: any) => {
  try {
    const result = await seedFakePropsForWeek(req.params.weekId);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
