import { StatType } from "@prisma/client";
import { prisma } from "../db/prisma";

const FAKE_PLAYERS: Array<{ name: string; team: string; position: string }> = [
  // QBs
  { name: "Patrick Mahomes", team: "KC", position: "QB" },
  { name: "Josh Allen", team: "BUF", position: "QB" },
  { name: "Lamar Jackson", team: "BAL", position: "QB" },
  { name: "Jalen Hurts", team: "PHI", position: "QB" },
  { name: "Joe Burrow", team: "CIN", position: "QB" },
  { name: "Justin Herbert", team: "LAC", position: "QB" },
  { name: "Dak Prescott", team: "DAL", position: "QB" },
  { name: "Tua Tagovailoa", team: "MIA", position: "QB" },
  { name: "C.J. Stroud", team: "HOU", position: "QB" },
  { name: "Brock Purdy", team: "SF", position: "QB" },
  { name: "Jayden Daniels", team: "WAS", position: "QB" },
  { name: "Bo Nix", team: "DEN", position: "QB" },
  { name: "Jordan Love", team: "GB", position: "QB" },
  { name: "Sam Darnold", team: "MIN", position: "QB" },
  { name: "Kirk Cousins", team: "ATL", position: "QB" },
  { name: "Caleb Williams", team: "CHI", position: "QB" },
  { name: "Geno Smith", team: "SEA", position: "QB" },
  { name: "Derek Carr", team: "NO", position: "QB" },
  { name: "Matthew Stafford", team: "LAR", position: "QB" },
  { name: "Baker Mayfield", team: "TB", position: "QB" },
  { name: "Trevor Lawrence", team: "JAX", position: "QB" },
  { name: "Will Levis", team: "TEN", position: "QB" },
  { name: "Anthony Richardson", team: "IND", position: "QB" },
  { name: "Jacoby Brissett", team: "NE", position: "QB" },
  { name: "Deshaun Watson", team: "CLE", position: "QB" },
  { name: "Daniel Jones", team: "NYG", position: "QB" },
  { name: "Aaron Rodgers", team: "NYJ", position: "QB" },
  { name: "Kyler Murray", team: "ARI", position: "QB" },
  { name: "Bryce Young", team: "CAR", position: "QB" },
  { name: "Aidan O'Connell", team: "LV", position: "QB" },
  // RBs
  { name: "Christian McCaffrey", team: "SF", position: "RB" },
  { name: "Derrick Henry", team: "BAL", position: "RB" },
  { name: "Saquon Barkley", team: "PHI", position: "RB" },
  { name: "Jahmyr Gibbs", team: "DET", position: "RB" },
  { name: "Josh Jacobs", team: "GB", position: "RB" },
  { name: "De'Von Achane", team: "MIA", position: "RB" },
  { name: "Bijan Robinson", team: "ATL", position: "RB" },
  { name: "Isiah Pacheco", team: "KC", position: "RB" },
  { name: "Joe Mixon", team: "HOU", position: "RB" },
  { name: "James Cook", team: "BUF", position: "RB" },
  { name: "Kyren Williams", team: "LAR", position: "RB" },
  { name: "Tony Pollard", team: "TEN", position: "RB" },
  { name: "Jonathan Taylor", team: "IND", position: "RB" },
  { name: "David Montgomery", team: "DET", position: "RB" },
  { name: "Rhamondre Stevenson", team: "NE", position: "RB" },
  { name: "Raheem Mostert", team: "MIA", position: "RB" },
  { name: "Zach Charbonnet", team: "SEA", position: "RB" },
  { name: "Najee Harris", team: "PIT", position: "RB" },
  { name: "Aaron Jones", team: "MIN", position: "RB" },
  { name: "Rachaad White", team: "TB", position: "RB" },
  { name: "Travis Etienne", team: "JAX", position: "RB" },
  { name: "James Conner", team: "ARI", position: "RB" },
  { name: "Kareem Hunt", team: "CLE", position: "RB" },
  { name: "Breece Hall", team: "NYJ", position: "RB" },
  { name: "Antonio Gibson", team: "NE", position: "RB" },
  { name: "Alvin Kamara", team: "NO", position: "RB" },
  { name: "Zamir White", team: "LV", position: "RB" },
  { name: "Javonte Williams", team: "DEN", position: "RB" },
  { name: "D'Andre Swift", team: "CHI", position: "RB" },
  // WRs
  { name: "Tyreek Hill", team: "MIA", position: "WR" },
  { name: "CeeDee Lamb", team: "DAL", position: "WR" },
  { name: "Ja'Marr Chase", team: "CIN", position: "WR" },
  { name: "Justin Jefferson", team: "MIN", position: "WR" },
  { name: "Stefon Diggs", team: "HOU", position: "WR" },
  { name: "Davante Adams", team: "LV", position: "WR" },
  { name: "Amon-Ra St. Brown", team: "DET", position: "WR" },
  { name: "Deebo Samuel", team: "SF", position: "WR" },
  { name: "Puka Nacua", team: "LAR", position: "WR" },
  { name: "Brandon Aiyuk", team: "SF", position: "WR" },
  { name: "Keenan Allen", team: "CHI", position: "WR" },
  { name: "Jaylen Waddle", team: "MIA", position: "WR" },
  { name: "Rashee Rice", team: "KC", position: "WR" },
  { name: "Garrett Wilson", team: "NYJ", position: "WR" },
  { name: "Tee Higgins", team: "CIN", position: "WR" },
  { name: "Amari Cooper", team: "CLE", position: "WR" },
  { name: "Mike Evans", team: "TB", position: "WR" },
  { name: "Chris Godwin", team: "TB", position: "WR" },
  { name: "D.K. Metcalf", team: "SEA", position: "WR" },
  { name: "Tyler Lockett", team: "SEA", position: "WR" },
  { name: "Courtland Sutton", team: "DEN", position: "WR" },
  { name: "Chris Olave", team: "NO", position: "WR" },
  { name: "Quentin Johnston", team: "LAC", position: "WR" },
  { name: "Diontae Johnson", team: "BAL", position: "WR" },
  { name: "A.J. Brown", team: "PHI", position: "WR" },
  { name: "DeVonta Smith", team: "PHI", position: "WR" },
  { name: "Calvin Ridley", team: "TEN", position: "WR" },
  { name: "Christian Kirk", team: "JAX", position: "WR" },
  { name: "Davante Adams", team: "NYJ", position: "WR" },
  { name: "Stefon Diggs", team: "BUF", position: "WR" },
  { name: "Marvin Harrison Jr.", team: "ARI", position: "WR" },
  { name: "Jaxon Smith-Njigba", team: "SEA", position: "WR" },
  { name: "Rome Odunze", team: "CHI", position: "WR" },
  // TEs
  { name: "Travis Kelce", team: "KC", position: "TE" },
  { name: "Sam LaPorta", team: "DET", position: "TE" },
  { name: "Mark Andrews", team: "BAL", position: "TE" },
  { name: "George Kittle", team: "SF", position: "TE" },
  { name: "Evan Engram", team: "JAX", position: "TE" },
  { name: "T.J. Hockenson", team: "MIN", position: "TE" },
  { name: "Jake Ferguson", team: "DAL", position: "TE" },
  { name: "David Njoku", team: "CLE", position: "TE" },
  { name: "Dalton Kincaid", team: "BUF", position: "TE" },
  { name: "Cole Kmet", team: "CHI", position: "TE" },
  { name: "Cade Otton", team: "TB", position: "TE" },
  { name: "Tucker Kraft", team: "GB", position: "TE" },
  { name: "Isaiah Likely", team: "BAL", position: "TE" },
  { name: "Will Dissly", team: "LAC", position: "TE" },
  { name: "Dallas Goedert", team: "PHI", position: "TE" },
  { name: "Kyle Pitts", team: "ATL", position: "TE" },
  { name: "Pat Freiermuth", team: "PIT", position: "TE" },
  { name: "Trey McBride", team: "ARI", position: "TE" },
  // Edge / LB
  { name: "Micah Parsons", team: "DAL", position: "LB" },
  { name: "Myles Garrett", team: "CLE", position: "DE" },
  { name: "Nick Bosa", team: "SF", position: "DE" },
  { name: "Maxx Crosby", team: "LV", position: "DE" },
  { name: "T.J. Watt", team: "PIT", position: "LB" },
  { name: "Roquan Smith", team: "BAL", position: "LB" },
  { name: "Brian Burns", team: "NYG", position: "DE" },
  { name: "Danielle Hunter", team: "HOU", position: "DE" },
  { name: "Josh Allen", team: "JAX", position: "DE" },
  { name: "Haason Reddick", team: "NYJ", position: "LB" },
  { name: "Rashan Gary", team: "GB", position: "LB" },
  { name: "Aidan Hutchinson", team: "DET", position: "DE" },
  { name: "Matt Judon", team: "ATL", position: "LB" },
  { name: "Von Miller", team: "BUF", position: "LB" },
  { name: "Za'Darius Smith", team: "CLE", position: "DE" },
  { name: "Shaquil Barrett", team: "TB", position: "LB" },
  { name: "Harold Landry", team: "TEN", position: "LB" },
  // Kickers
  { name: "Justin Tucker", team: "BAL", position: "K" },
  { name: "Harrison Butker", team: "KC", position: "K" },
  { name: "Evan McPherson", team: "CIN", position: "K" },
  { name: "Tyler Bass", team: "BUF", position: "K" },
  { name: "Jake Elliott", team: "PHI", position: "K" },
  { name: "Brandon Aubrey", team: "DAL", position: "K" },
  { name: "Younghoe Koo", team: "ATL", position: "K" },
  { name: "Jason Sanders", team: "MIA", position: "K" },
  { name: "Cameron Dicker", team: "LAC", position: "K" },
  { name: "Greg Joseph", team: "MIN", position: "K" },
  { name: "Chris Boswell", team: "PIT", position: "K" },
  { name: "Matt Gay", team: "IND", position: "K" },
  { name: "Chase McLaughlin", team: "TB", position: "K" },
  { name: "Daniel Carlson", team: "LV", position: "K" },
  { name: "Wil Lutz", team: "DEN", position: "K" },
  { name: "Cairo Santos", team: "CHI", position: "K" },
  { name: "Ryan Succop", team: "TEN", position: "K" },
  { name: "Ka'imi Fairbairn", team: "HOU", position: "K" },
  { name: "Graham Gano", team: "NYG", position: "K" },
  { name: "Dustin Hopkins", team: "CLE", position: "K" },
  { name: "Matt Prater", team: "ARI", position: "K" },
  { name: "Eddy Pineiro", team: "CAR", position: "K" },
  { name: "Nick Folk", team: "NE", position: "K" },
  { name: "Jason Myers", team: "SEA", position: "K" },
  { name: "Matthew Wright", team: "JAX", position: "K" },
  { name: "Robbie Gould", team: "SF", position: "K" },
  { name: "Matt Ammendola", team: "NYJ", position: "K" },
  { name: "Riley Patterson", team: "DET", position: "K" },
  { name: "Anders Carlson", team: "GB", position: "K" },
  { name: "Cade York", team: "NO", position: "K" },
  { name: "Joshua Karty", team: "LAR", position: "K" },
  { name: "Tyler Sievert", team: "WAS", position: "K" },
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

const SLOTS: Record<string, number> = { QB: 1, RB: 2, WR: 3, TE: 1, DE: 1, LB: 1, K: 1 };

function fakeVariant(base: number): number {
  return Math.round((base * (1 + (Math.random() * 2 - 1) * 0.12)) * 2) / 2;
}

function altSpreadOdds(altLine: number, mainLine: number): number {
  const diff = altLine - mainLine;
  return Math.max(-350, Math.min(280, Math.round(-110 - diff * 35)));
}

function altTotalOdds(altTotal: number, mainTotal: number, direction: "OVER" | "UNDER"): number {
  const diff = altTotal - mainTotal;
  const favSteps = direction === "OVER" ? -diff : diff;
  return Math.max(-350, Math.min(280, Math.round(-110 - favSteps * 28)));
}

function fakeAltGameLines(
  homeTeam: string,
  awayTeam: string,
  mainHomeSpread: number,
  mainTotal: number,
): Array<{ market: string; label: string; odds: number; line: number }> {
  const fmt = (n: number) => `${n > 0 ? "+" : ""}${n}`;
  const altLines: Array<{ market: string; label: string; odds: number; line: number }> = [];
  for (const offset of [-4.5, -3.0, -1.5, 1.5, 3.0, 4.5]) {
    const homeAlt = Math.round((mainHomeSpread + offset) * 2) / 2;
    const awayAlt = -homeAlt;
    altLines.push({ market: `ALT_SPREAD_HOME_${homeAlt}`, label: `${homeTeam} ${fmt(homeAlt)}`, odds: altSpreadOdds(homeAlt, mainHomeSpread), line: homeAlt });
    altLines.push({ market: `ALT_SPREAD_AWAY_${awayAlt}`, label: `${awayTeam} ${fmt(awayAlt)}`, odds: altSpreadOdds(awayAlt, -mainHomeSpread), line: awayAlt });
  }
  for (const offset of [-9, -6, -3, 3, 6, 9]) {
    const altTotal = Math.round((mainTotal + offset) * 2) / 2;
    altLines.push({ market: `ALT_TOTAL_OVER_${altTotal}`, label: `Over ${altTotal}`, odds: altTotalOdds(altTotal, mainTotal, "OVER"), line: altTotal });
    altLines.push({ market: `ALT_TOTAL_UNDER_${altTotal}`, label: `Under ${altTotal}`, odds: altTotalOdds(altTotal, mainTotal, "UNDER"), line: altTotal });
  }
  return altLines;
}

export function fakeLinesForGame(homeTeam: string, awayTeam: string) {
  const total = 42 + Math.floor(Math.random() * 13);
  const homeSpread = parseFloat((-(Math.random() * 10 - 1)).toFixed(1));
  const awaySpread = parseFloat((-homeSpread).toFixed(1));
  const homeML = homeSpread < 0 ? -(130 + Math.floor(Math.random() * 50)) : 115 + Math.floor(Math.random() * 50);
  const awayML = homeSpread < 0 ? 115 + Math.floor(Math.random() * 50) : -(130 + Math.floor(Math.random() * 50));
  return [
    { market: "MONEYLINE_HOME", label: `${homeTeam} ML`, odds: homeML, line: null as number | null },
    { market: "MONEYLINE_AWAY", label: `${awayTeam} ML`, odds: awayML, line: null as number | null },
    { market: "SPREAD_HOME", label: `${homeTeam} ${homeSpread > 0 ? "+" : ""}${homeSpread}`, odds: -110, line: homeSpread as number | null },
    { market: "SPREAD_AWAY", label: `${awayTeam} ${awaySpread > 0 ? "+" : ""}${awaySpread}`, odds: -110, line: awaySpread as number | null },
    { market: "TOTAL_OVER", label: `Over ${total}.5`, odds: -110, line: (total + 0.5) as number | null },
    { market: "TOTAL_UNDER", label: `Under ${total}.5`, odds: -110, line: (total + 0.5) as number | null },
  ];
}

export async function seedFakePropsForWeek(weekId: string): Promise<{ lines: number; props: number }> {
  const week = await prisma.week.findUnique({ where: { id: weekId }, include: { games: true } });
  if (!week) throw new Error("Week not found");

  let linesSynced = 0, propsSynced = 0;

  for (const game of week.games) {
    const gameLineData = fakeLinesForGame(game.homeTeam, game.awayTeam);
    for (const gl of gameLineData) {
      await prisma.gameLine.upsert({
        where: { gameId_market: { gameId: game.id, market: gl.market } },
        update: { label: gl.label, odds: gl.odds, line: gl.line },
        create: { gameId: game.id, market: gl.market, label: gl.label, odds: gl.odds, line: gl.line },
      });
      linesSynced++;
    }

    const mainHomeSpread = gameLineData.find((l) => l.market === "SPREAD_HOME");
    const mainTotalOver  = gameLineData.find((l) => l.market === "TOTAL_OVER");
    if (mainHomeSpread?.line != null && mainTotalOver?.line != null) {
      const altGameLines = fakeAltGameLines(game.homeTeam, game.awayTeam, mainHomeSpread.line, mainTotalOver.line);
      for (const al of altGameLines) {
        await prisma.gameLine.upsert({
          where: { gameId_market: { gameId: game.id, market: al.market } },
          update: { label: al.label, odds: al.odds, line: al.line },
          create: { gameId: game.id, market: al.market, label: al.label, odds: al.odds, line: al.line },
        });
        linesSynced++;
      }
    }

    const teamNames = [game.homeTeam, game.awayTeam];
    const gamePlayers = FAKE_PLAYERS.filter((p) => teamNames.includes(p.team));

    for (const team of teamNames) {
      const teamPlayers = gamePlayers.filter((p) => p.team === team);
      for (const [pos, count] of Object.entries(SLOTS)) {
        const posPlayers = teamPlayers.filter((p) => p.position === pos).slice(0, count);
        const propTemplate = POSITION_PROPS[pos];
        if (!propTemplate) continue;

        for (const fp of posPlayers) {
          let player = await prisma.player.findFirst({ where: { name: fp.name } });
          if (!player) {
            player = await prisma.player.create({ data: { name: fp.name, team: fp.team, position: fp.position } });
          }

          for (const { statType, line, odds } of propTemplate) {
            const variedLine = fakeVariant(line);
            const existing = await prisma.prop.findFirst({ where: { gameId: game.id, playerId: player.id, statType } });
            if (existing) {
              await prisma.prop.update({ where: { id: existing.id }, data: { line: variedLine, odds } });
            } else {
              await prisma.prop.create({ data: { gameId: game.id, playerId: player.id, statType, line: variedLine, odds } });
            }
            propsSynced++;
          }
        }
      }
    }
  }

  return { lines: linesSynced, props: propsSynced };
}
