import { Router } from "express";
import { StatType } from "@prisma/client";
import { prisma } from "../db/prisma";
import { requireAuth, requireAdmin } from "../middleware/auth";
import { getNFLEvents, getPlayerProps } from "../services/oddsApi";

const router = Router();

const MARKET_TO_STAT: Record<string, StatType> = {
  player_pass_yds: StatType.PASSING_YARDS,
  player_pass_tds: StatType.TOUCHDOWNS,
  player_rush_yds: StatType.RUSHING_YARDS,
  player_reception_yds: StatType.RECEIVING_YARDS,
  player_receptions: StatType.RECEPTIONS,
};

const MARKET_TO_POSITION: Record<string, string> = {
  player_pass_yds: "QB",
  player_pass_tds: "QB",
  player_rush_yds: "RB",
  player_reception_yds: "WR",
  player_receptions: "WR",
};

// Pull all NFL games within a week's date range from The Odds API
router.post("/games/:weekId", requireAuth, requireAdmin, async (req: any, res: any) => {
  try {
    const week = await prisma.week.findUnique({ where: { id: req.params.weekId } });
    if (!week) { res.status(404).json({ error: "Week not found" }); return; }

    const events = await getNFLEvents();
    const start = new Date(week.startDate);
    const end = new Date(week.endDate);

    const inRange = events.filter((e) => {
      const d = new Date(e.commence_time);
      return d >= start && d <= end;
    });

    const games = [];
    for (const event of inRange) {
      const game = await prisma.game.upsert({
        where: { externalId: event.id },
        update: {},
        create: {
          weekId: week.id,
          homeTeam: event.home_team,
          awayTeam: event.away_team,
          gameDate: new Date(event.commence_time),
          externalId: event.id,
        },
      });
      games.push(game);
    }

    res.json({ synced: games.length, games });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Pull player props for a specific game from The Odds API
router.post("/props/:gameId", requireAuth, requireAdmin, async (req: any, res: any) => {
  try {
    const game = await prisma.game.findUnique({ where: { id: req.params.gameId } });
    if (!game) { res.status(404).json({ error: "Game not found" }); return; }
    if (!game.externalId) {
      res.status(400).json({ error: "Game was not synced from The Odds API — no external ID" });
      return;
    }

    const rawProps = await getPlayerProps(game.externalId);
    const created = [];

    for (const raw of rawProps) {
      const statType = MARKET_TO_STAT[raw.market];
      if (!statType) continue;

      // Find or create player by name
      let player = await prisma.player.findFirst({ where: { name: raw.playerName } });
      if (!player) {
        player = await prisma.player.create({
          data: {
            name: raw.playerName,
            team: "",
            position: MARKET_TO_POSITION[raw.market] ?? "FLEX",
          },
        });
      }

      // Skip if this prop already exists
      const exists = await prisma.prop.findFirst({
        where: { gameId: game.id, playerId: player.id, statType },
      });
      if (exists) continue;

      const prop = await prisma.prop.create({
        data: { gameId: game.id, playerId: player.id, statType, line: raw.line },
        include: { player: true },
      });
      created.push(prop);
    }

    res.json({ synced: created.length, props: created });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
