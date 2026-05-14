import { Router } from "express";
import { StatType } from "@prisma/client";
import { prisma } from "../db/prisma";
import { requireAuth, requireAdmin } from "../middleware/auth";
import { getNFLWeekData } from "../services/oddsApi";

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

// Real NFL players for fake data seeding — matched by team name
const FAKE_PLAYERS: Array<{ name: string; team: string; position: string }> = [
  // QBs
  { name: "Patrick Mahomes", team: "Kansas City Chiefs", position: "QB" },
  { name: "Josh Allen", team: "Buffalo Bills", position: "QB" },
  { name: "Lamar Jackson", team: "Baltimore Ravens", position: "QB" },
  { name: "Jalen Hurts", team: "Philadelphia Eagles", position: "QB" },
  { name: "Joe Burrow", team: "Cincinnati Bengals", position: "QB" },
  { name: "Justin Herbert", team: "Los Angeles Chargers", position: "QB" },
  { name: "Dak Prescott", team: "Dallas Cowboys", position: "QB" },
  { name: "Tua Tagovailoa", team: "Miami Dolphins", position: "QB" },
  { name: "C.J. Stroud", team: "Houston Texans", position: "QB" },
  { name: "Brock Purdy", team: "San Francisco 49ers", position: "QB" },
  { name: "Jayden Daniels", team: "Washington Commanders", position: "QB" },
  { name: "Bo Nix", team: "Denver Broncos", position: "QB" },
  { name: "Jordan Love", team: "Green Bay Packers", position: "QB" },
  { name: "Sam Darnold", team: "Minnesota Vikings", position: "QB" },
  { name: "Kirk Cousins", team: "Atlanta Falcons", position: "QB" },
  { name: "Caleb Williams", team: "Chicago Bears", position: "QB" },
  { name: "Geno Smith", team: "Seattle Seahawks", position: "QB" },
  { name: "Derek Carr", team: "New Orleans Saints", position: "QB" },
  { name: "Matthew Stafford", team: "Los Angeles Rams", position: "QB" },
  { name: "Baker Mayfield", team: "Tampa Bay Buccaneers", position: "QB" },
  // RBs
  { name: "Christian McCaffrey", team: "San Francisco 49ers", position: "RB" },
  { name: "Derrick Henry", team: "Baltimore Ravens", position: "RB" },
  { name: "Saquon Barkley", team: "Philadelphia Eagles", position: "RB" },
  { name: "Jahmyr Gibbs", team: "Detroit Lions", position: "RB" },
  { name: "Josh Jacobs", team: "Green Bay Packers", position: "RB" },
  { name: "De'Von Achane", team: "Miami Dolphins", position: "RB" },
  { name: "Bijan Robinson", team: "Atlanta Falcons", position: "RB" },
  { name: "Isiah Pacheco", team: "Kansas City Chiefs", position: "RB" },
  { name: "Joe Mixon", team: "Houston Texans", position: "RB" },
  { name: "James Cook", team: "Buffalo Bills", position: "RB" },
  { name: "Kyren Williams", team: "Los Angeles Rams", position: "RB" },
  { name: "Tony Pollard", team: "Tennessee Titans", position: "RB" },
  { name: "Jonathan Taylor", team: "Indianapolis Colts", position: "RB" },
  { name: "David Montgomery", team: "Detroit Lions", position: "RB" },
  { name: "Rhamondre Stevenson", team: "New England Patriots", position: "RB" },
  { name: "Raheem Mostert", team: "Miami Dolphins", position: "RB" },
  { name: "Zach Charbonnet", team: "Seattle Seahawks", position: "RB" },
  { name: "Najee Harris", team: "Pittsburgh Steelers", position: "RB" },
  { name: "Aaron Jones", team: "Minnesota Vikings", position: "RB" },
  { name: "Rachaad White", team: "Tampa Bay Buccaneers", position: "RB" },
  // WRs
  { name: "Tyreek Hill", team: "Miami Dolphins", position: "WR" },
  { name: "CeeDee Lamb", team: "Dallas Cowboys", position: "WR" },
  { name: "Ja'Marr Chase", team: "Cincinnati Bengals", position: "WR" },
  { name: "Justin Jefferson", team: "Minnesota Vikings", position: "WR" },
  { name: "Stefon Diggs", team: "Houston Texans", position: "WR" },
  { name: "Davante Adams", team: "Las Vegas Raiders", position: "WR" },
  { name: "Amon-Ra St. Brown", team: "Detroit Lions", position: "WR" },
  { name: "Deebo Samuel", team: "San Francisco 49ers", position: "WR" },
  { name: "Puka Nacua", team: "Los Angeles Rams", position: "WR" },
  { name: "Brandon Aiyuk", team: "San Francisco 49ers", position: "WR" },
  { name: "Keenan Allen", team: "Chicago Bears", position: "WR" },
  { name: "Jaylen Waddle", team: "Miami Dolphins", position: "WR" },
  { name: "Rashee Rice", team: "Kansas City Chiefs", position: "WR" },
  { name: "Garrett Wilson", team: "New York Jets", position: "WR" },
  { name: "Tee Higgins", team: "Cincinnati Bengals", position: "WR" },
  { name: "Amari Cooper", team: "Cleveland Browns", position: "WR" },
  { name: "Mike Evans", team: "Tampa Bay Buccaneers", position: "WR" },
  { name: "Chris Godwin", team: "Tampa Bay Buccaneers", position: "WR" },
  { name: "D.K. Metcalf", team: "Seattle Seahawks", position: "WR" },
  { name: "Tyler Lockett", team: "Seattle Seahawks", position: "WR" },
  { name: "Courtland Sutton", team: "Denver Broncos", position: "WR" },
  { name: "Davante Adams", team: "New York Jets", position: "WR" },
  { name: "Chris Olave", team: "New Orleans Saints", position: "WR" },
  { name: "Quentin Johnston", team: "Los Angeles Chargers", position: "WR" },
  { name: "Diontae Johnson", team: "Baltimore Ravens", position: "WR" },
  // TEs
  { name: "Travis Kelce", team: "Kansas City Chiefs", position: "TE" },
  { name: "Sam LaPorta", team: "Detroit Lions", position: "TE" },
  { name: "Mark Andrews", team: "Baltimore Ravens", position: "TE" },
  { name: "George Kittle", team: "San Francisco 49ers", position: "TE" },
  { name: "Evan Engram", team: "Jacksonville Jaguars", position: "TE" },
  { name: "T.J. Hockenson", team: "Minnesota Vikings", position: "TE" },
  { name: "Jake Ferguson", team: "Dallas Cowboys", position: "TE" },
  { name: "David Njoku", team: "Cleveland Browns", position: "TE" },
  { name: "Dalton Kincaid", team: "Buffalo Bills", position: "TE" },
  { name: "Cole Kmet", team: "Chicago Bears", position: "TE" },
  { name: "Cade Otton", team: "Tampa Bay Buccaneers", position: "TE" },
  { name: "Tucker Kraft", team: "Green Bay Packers", position: "TE" },
  { name: "Isaiah Likely", team: "Baltimore Ravens", position: "TE" },
  { name: "Will Dissly", team: "Los Angeles Chargers", position: "TE" },
  // Edge / LB (for sacks/tackles)
  { name: "Micah Parsons", team: "Dallas Cowboys", position: "LB" },
  { name: "Myles Garrett", team: "Cleveland Browns", position: "DE" },
  { name: "Nick Bosa", team: "San Francisco 49ers", position: "DE" },
  { name: "Maxx Crosby", team: "Las Vegas Raiders", position: "DE" },
  { name: "T.J. Watt", team: "Pittsburgh Steelers", position: "LB" },
  { name: "Roquan Smith", team: "Baltimore Ravens", position: "LB" },
  { name: "Brian Burns", team: "New York Giants", position: "DE" },
  { name: "Danielle Hunter", team: "Houston Texans", position: "DE" },
  { name: "Josh Allen", team: "Jacksonville Jaguars", position: "DE" },
  { name: "Haason Reddick", team: "New York Jets", position: "LB" },
  { name: "Rashan Gary", team: "Green Bay Packers", position: "LB" },
  { name: "Aidan Hutchinson", team: "Detroit Lions", position: "DE" },
  // Kickers
  { name: "Justin Tucker", team: "Baltimore Ravens", position: "K" },
  { name: "Harrison Butker", team: "Kansas City Chiefs", position: "K" },
  { name: "Evan McPherson", team: "Cincinnati Bengals", position: "K" },
  { name: "Tyler Bass", team: "Buffalo Bills", position: "K" },
  { name: "Jake Elliott", team: "Philadelphia Eagles", position: "K" },
  { name: "Brandon Aubrey", team: "Dallas Cowboys", position: "K" },
  { name: "Younghoe Koo", team: "Atlanta Falcons", position: "K" },
  { name: "Jason Sanders", team: "Miami Dolphins", position: "K" },
  { name: "Cameron Dicker", team: "Los Angeles Chargers", position: "K" },
  { name: "Greg Joseph", team: "Minnesota Vikings", position: "K" },
  { name: "Chris Boswell", team: "Pittsburgh Steelers", position: "K" },
  { name: "Matt Gay", team: "Indianapolis Colts", position: "K" },
];

const QB_PROPS: Array<{ statType: StatType; line: number; odds: number }> = [
  { statType: StatType.PASSING_YARDS, line: 245.5, odds: -110 },
  { statType: StatType.PASSING_TOUCHDOWNS, line: 1.5, odds: -130 },
  { statType: StatType.PASSING_COMPLETIONS, line: 23.5, odds: -110 },
  { statType: StatType.PASSING_ATTEMPTS, line: 35.5, odds: -110 },
  { statType: StatType.PASSING_INTERCEPTIONS, line: 0.5, odds: -145 },
  { statType: StatType.PASSING_LONGEST, line: 42.5, odds: -110 },
  { statType: StatType.RUSHING_YARDS, line: 22.5, odds: -110 },
];

const RB_PROPS: Array<{ statType: StatType; line: number; odds: number }> = [
  { statType: StatType.RUSHING_YARDS, line: 72.5, odds: -110 },
  { statType: StatType.RUSHING_TOUCHDOWNS, line: 0.5, odds: -145 },
  { statType: StatType.RUSHING_ATTEMPTS, line: 14.5, odds: -110 },
  { statType: StatType.RUSHING_LONGEST, line: 18.5, odds: -110 },
  { statType: StatType.RECEIVING_YARDS, line: 22.5, odds: -110 },
  { statType: StatType.RECEPTIONS, line: 3.5, odds: -110 },
  { statType: StatType.RECEIVING_TARGETS, line: 4.5, odds: -110 },
];

const WR_PROPS: Array<{ statType: StatType; line: number; odds: number }> = [
  { statType: StatType.RECEIVING_YARDS, line: 62.5, odds: -110 },
  { statType: StatType.RECEIVING_TOUCHDOWNS, line: 0.5, odds: -140 },
  { statType: StatType.RECEPTIONS, line: 5.5, odds: -110 },
  { statType: StatType.RECEIVING_TARGETS, line: 7.5, odds: -110 },
  { statType: StatType.RECEIVING_LONGEST, line: 28.5, odds: -110 },
];

const TE_PROPS: Array<{ statType: StatType; line: number; odds: number }> = [
  { statType: StatType.RECEIVING_YARDS, line: 42.5, odds: -110 },
  { statType: StatType.RECEIVING_TOUCHDOWNS, line: 0.5, odds: -140 },
  { statType: StatType.RECEPTIONS, line: 3.5, odds: -110 },
  { statType: StatType.RECEIVING_TARGETS, line: 5.5, odds: -110 },
  { statType: StatType.RECEIVING_LONGEST, line: 22.5, odds: -110 },
];

const DE_PROPS: Array<{ statType: StatType; line: number; odds: number }> = [
  { statType: StatType.SACKS, line: 0.5, odds: -145 },
  { statType: StatType.TACKLES_ASSISTS, line: 4.5, odds: -110 },
];

const LB_PROPS: Array<{ statType: StatType; line: number; odds: number }> = [
  { statType: StatType.SACKS, line: 0.5, odds: -165 },
  { statType: StatType.TACKLES_ASSISTS, line: 6.5, odds: -110 },
  { statType: StatType.DEFENSIVE_INTERCEPTIONS, line: 0.5, odds: 180 },
];

const K_PROPS: Array<{ statType: StatType; line: number; odds: number }> = [
  { statType: StatType.FIELD_GOALS_MADE, line: 1.5, odds: -145 },
  { statType: StatType.KICKING_POINTS, line: 7.5, odds: -110 },
  { statType: StatType.EXTRA_POINTS_MADE, line: 1.5, odds: -110 },
  { statType: StatType.FIELD_GOAL_LONGEST, line: 48.5, odds: -110 },
];

const POSITION_PROPS: Record<string, Array<{ statType: StatType; line: number; odds: number }>> = {
  QB: QB_PROPS, RB: RB_PROPS, WR: WR_PROPS, TE: TE_PROPS, DE: DE_PROPS, LB: LB_PROPS, K: K_PROPS,
};

function fakeVariant(base: number, pct = 0.12): number {
  return Math.round((base * (1 + (Math.random() * 2 - 1) * pct)) * 2) / 2;
}

function fakeLine(base: number): number {
  const spread = parseFloat((Math.random() * 8 - 2).toFixed(1));
  return spread;
}

function fakeLinesForGame(homeTeam: string, awayTeam: string) {
  const total = 42 + Math.floor(Math.random() * 13);
  const homeSpread = parseFloat((-(Math.random() * 10 - 1)).toFixed(1));
  const awaySpread = parseFloat((-homeSpread).toFixed(1));
  const homeML = homeSpread < 0 ? -(130 + Math.floor(Math.random() * 50)) : 115 + Math.floor(Math.random() * 50);
  const awayML = homeSpread < 0 ? 115 + Math.floor(Math.random() * 50) : -(130 + Math.floor(Math.random() * 50));
  return [
    { market: "MONEYLINE_HOME", label: `${homeTeam} ML`, odds: homeML, line: null },
    { market: "MONEYLINE_AWAY", label: `${awayTeam} ML`, odds: awayML, line: null },
    { market: "SPREAD_HOME", label: `${homeTeam} ${homeSpread > 0 ? "+" : ""}${homeSpread}`, odds: -110, line: homeSpread },
    { market: "SPREAD_AWAY", label: `${awayTeam} ${awaySpread > 0 ? "+" : ""}${awaySpread}`, odds: -110, line: awaySpread },
    { market: "TOTAL_OVER", label: `Over ${total}.5`, odds: -110, line: total + 0.5 },
    { market: "TOTAL_UNDER", label: `Under ${total}.5`, odds: -110, line: total + 0.5 },
  ];
}

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
    const week = await prisma.week.findUnique({
      where: { id: req.params.weekId },
      include: { games: true },
    });
    if (!week) { res.status(404).json({ error: "Week not found" }); return; }

    let linesSynced = 0, propsSynced = 0;

    for (const game of week.games) {
      // Upsert fake game lines
      const gameLineData = fakeLinesForGame(game.homeTeam, game.awayTeam);
      for (const gl of gameLineData) {
        await prisma.gameLine.upsert({
          where: { gameId_market: { gameId: game.id, market: gl.market } },
          update: { label: gl.label, odds: gl.odds, line: gl.line },
          create: { gameId: game.id, market: gl.market, label: gl.label, odds: gl.odds, line: gl.line },
        });
        linesSynced++;
      }

      // Find players for both teams
      const teamNames = [game.homeTeam, game.awayTeam];
      const gamePlayers = FAKE_PLAYERS.filter((p) => teamNames.includes(p.team));

      // QB: 1 per team; RB: 2 per team; WR: 3 per team; TE: 1 per team; DE/LB: 2 per team; K: 1 per team
      const SLOTS: Record<string, number> = { QB: 1, RB: 2, WR: 3, TE: 1, DE: 1, LB: 1, K: 1 };

      for (const team of teamNames) {
        const teamPlayers = gamePlayers.filter((p) => p.team === team);

        for (const [pos, count] of Object.entries(SLOTS)) {
          const posPlayers = teamPlayers.filter((p) => p.position === pos).slice(0, count);
          const propTemplate = POSITION_PROPS[pos];
          if (!propTemplate) continue;

          for (const fp of posPlayers) {
            let player = await prisma.player.findFirst({ where: { name: fp.name } });
            if (!player) {
              player = await prisma.player.create({
                data: { name: fp.name, team: fp.team, position: fp.position },
              });
            }

            for (const { statType, line, odds } of propTemplate) {
              const variedLine = fakeVariant(line);
              const existing = await prisma.prop.findFirst({
                where: { gameId: game.id, playerId: player.id, statType },
              });
              if (existing) {
                await prisma.prop.update({ where: { id: existing.id }, data: { line: variedLine, odds } });
              } else {
                await prisma.prop.create({
                  data: { gameId: game.id, playerId: player.id, statType, line: variedLine, odds },
                });
              }
              propsSynced++;
            }
          }
        }
      }
    }

    res.json({ lines: linesSynced, props: propsSynced });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
