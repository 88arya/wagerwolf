import { db } from "../db/db";
import { and, eq, inArray, sql } from "drizzle-orm";
import { weeks, games, gameLines, players, props } from "../db/schema";

export const FAKE_PLAYERS: Array<{ name: string; team: string; position: string }> = [
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
  { name: "Jayden Daniels", team: "WSH", position: "QB" },
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
  { name: "Jared Goff", team: "DET", position: "QB" },
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
  { name: "Rico Dowdle", team: "DAL", position: "RB" },
  { name: "Tyrone Tracy Jr.", team: "NYG", position: "RB" },
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
  { name: "Zaven Collins", team: "ARI", position: "LB" },
  { name: "Jadeveon Clowney", team: "CAR", position: "DE" },
  { name: "Montez Sweat", team: "CHI", position: "DE" },
  { name: "Trey Hendrickson", team: "CIN", position: "DE" },
  { name: "Nik Bonitto", team: "DEN", position: "LB" },
  { name: "Laiatu Latu", team: "IND", position: "DE" },
  { name: "George Karlaftis", team: "KC", position: "DE" },
  { name: "Khalil Mack", team: "LAC", position: "DE" },
  { name: "Jared Verse", team: "LAR", position: "DE" },
  { name: "Bradley Chubb", team: "MIA", position: "DE" },
  { name: "Jonathan Greenard", team: "MIN", position: "DE" },
  { name: "Keion White", team: "NE", position: "DE" },
  { name: "Cameron Jordan", team: "NO", position: "DE" },
  { name: "Zack Baun", team: "PHI", position: "LB" },
  { name: "Boye Mafe", team: "SEA", position: "DE" },
  { name: "Frankie Luvu", team: "WSH", position: "LB" },
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
  { name: "Tyler Sievert", team: "WSH", position: "K" },
];

type PropTemplate = { statType: string; line: number; odds: number };

const QB_PROPS: PropTemplate[] = [
  { statType: "PASSING_YARDS", line: 245.5, odds: -110 },
  { statType: "PASSING_TOUCHDOWNS", line: 1.5, odds: -130 },
  { statType: "PASSING_COMPLETIONS", line: 23.5, odds: -110 },
  { statType: "PASSING_ATTEMPTS", line: 35.5, odds: -110 },
  { statType: "PASSING_INTERCEPTIONS", line: 0.5, odds: -145 },
  { statType: "PASSING_LONGEST", line: 42.5, odds: -110 },
  { statType: "RUSHING_YARDS", line: 22.5, odds: -110 },
];

const RB_PROPS: PropTemplate[] = [
  { statType: "RUSHING_YARDS", line: 72.5, odds: -110 },
  { statType: "RUSHING_TOUCHDOWNS", line: 0.5, odds: -145 },
  { statType: "RUSHING_ATTEMPTS", line: 14.5, odds: -110 },
  { statType: "RUSHING_LONGEST", line: 18.5, odds: -110 },
  { statType: "RECEIVING_YARDS", line: 22.5, odds: -110 },
  { statType: "RECEPTIONS", line: 3.5, odds: -110 },
  { statType: "RECEIVING_TARGETS", line: 4.5, odds: -110 },
];

const WR_PROPS: PropTemplate[] = [
  { statType: "RECEIVING_YARDS", line: 62.5, odds: -110 },
  { statType: "RECEIVING_TOUCHDOWNS", line: 0.5, odds: -140 },
  { statType: "RECEPTIONS", line: 5.5, odds: -110 },
  { statType: "RECEIVING_TARGETS", line: 7.5, odds: -110 },
  { statType: "RECEIVING_LONGEST", line: 28.5, odds: -110 },
];

const TE_PROPS: PropTemplate[] = [
  { statType: "RECEIVING_YARDS", line: 42.5, odds: -110 },
  { statType: "RECEIVING_TOUCHDOWNS", line: 0.5, odds: -140 },
  { statType: "RECEPTIONS", line: 3.5, odds: -110 },
  { statType: "RECEIVING_TARGETS", line: 5.5, odds: -110 },
  { statType: "RECEIVING_LONGEST", line: 22.5, odds: -110 },
];

const DE_PROPS: PropTemplate[] = [
  { statType: "SACKS", line: 0.5, odds: -145 },
  { statType: "TACKLES_ASSISTS", line: 4.5, odds: -110 },
];

const LB_PROPS: PropTemplate[] = [
  { statType: "SACKS", line: 0.5, odds: -165 },
  { statType: "TACKLES_ASSISTS", line: 6.5, odds: -110 },
  { statType: "DEFENSIVE_INTERCEPTIONS", line: 0.5, odds: 180 },
];

const K_PROPS: PropTemplate[] = [
  { statType: "FIELD_GOALS_MADE", line: 1.5, odds: -145 },
  { statType: "KICKING_POINTS", line: 7.5, odds: -110 },
  { statType: "EXTRA_POINTS_MADE", line: 1.5, odds: -110 },
  { statType: "FIELD_GOAL_LONGEST", line: 48.5, odds: -110 },
];

const POSITION_PROPS: Record<string, PropTemplate[]> = {
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

// Real FanDuel lines for actual NFL Week 1-12 2026 games, pulled live via SharpAPI on 2026-07-18.
// Used as a deterministic pool so synthetic matchups get real, properly-correlated
// ML/spread/total numbers instead of Math.random() output.
type RealLineTemplate = {
  homeML: number; awayML: number;
  homeSpread: number; homeSpreadOdds: number;
  awaySpread: number; awaySpreadOdds: number;
  total: number; overOdds: number; underOdds: number;
};

const REAL_GAME_LINES: RealLineTemplate[] = [
  { homeML: -198, awayML: 166, homeSpread: -4.5, homeSpreadOdds: -102, awaySpread: 4.5, awaySpreadOdds: -120, total: 44.5, overOdds: -115, underOdds: -105 },
  { homeML: -210, awayML: 176, homeSpread: -3.5, homeSpreadOdds: -115, awaySpread: 3.5, awaySpreadOdds: -105, total: 49.5, overOdds: -102, underOdds: -120 },
  { homeML: -106, awayML: -110, homeSpread: 1.5, homeSpreadOdds: -122, awaySpread: -1.5, awaySpreadOdds: 100, total: 44.5, overOdds: -112, underOdds: -108 },
  { homeML: 118, awayML: -138, homeSpread: 2.5, homeSpreadOdds: -105, awaySpread: -2.5, awaySpreadOdds: -115, total: 45.5, overOdds: -110, underOdds: -110 },
  { homeML: -210, awayML: 176, homeSpread: -3.5, homeSpreadOdds: -115, awaySpread: 3.5, awaySpreadOdds: -105, total: 51.5, overOdds: -112, underOdds: -108 },
  { homeML: -405, awayML: 320, homeSpread: -7.5, homeSpreadOdds: -115, awaySpread: 7.5, awaySpreadOdds: -105, total: 40.5, overOdds: -118, underOdds: -104 },
  { homeML: 168, awayML: -200, homeSpread: 3.5, homeSpreadOdds: -105, awaySpread: -3.5, awaySpreadOdds: -115, total: 48.5, overOdds: -110, underOdds: -110 },
  { homeML: -146, awayML: 124, homeSpread: -2.5, homeSpreadOdds: -120, awaySpread: 2.5, awaySpreadOdds: -102, total: 41.5, overOdds: -105, underOdds: -115 },
  { homeML: -134, awayML: 116, homeSpread: -2.5, homeSpreadOdds: -110, awaySpread: 2.5, awaySpreadOdds: -110, total: 38.5, overOdds: -110, underOdds: -110 },
  { homeML: -370, awayML: 295, homeSpread: -7, homeSpreadOdds: -115, awaySpread: 7, awaySpreadOdds: -105, total: 48.5, overOdds: -115, underOdds: -105 },
  { homeML: -215, awayML: 180, homeSpread: -4.5, homeSpreadOdds: -105, awaySpread: 4.5, awaySpreadOdds: -115, total: 47.5, overOdds: -115, underOdds: -105 },
  { homeML: -104, awayML: -112, homeSpread: 1.5, homeSpreadOdds: -120, awaySpread: -1.5, awaySpreadOdds: -102, total: 45.5, overOdds: -115, underOdds: -105 },
  { homeML: -590, awayML: 440, homeSpread: -10.5, homeSpreadOdds: -106, awaySpread: 10.5, awaySpreadOdds: -114, total: 46.5, overOdds: -110, underOdds: -110 },
  { homeML: -210, awayML: 176, homeSpread: -3.5, homeSpreadOdds: -120, awaySpread: 3.5, awaySpreadOdds: -102, total: 40.5, overOdds: -110, underOdds: -110 },
  { homeML: 128, awayML: -152, homeSpread: 2.5, homeSpreadOdds: -102, awaySpread: -2.5, awaySpreadOdds: -120, total: 47.5, overOdds: -115, underOdds: -105 },
  { homeML: -146, awayML: 124, homeSpread: -2.5, homeSpreadOdds: -118, awaySpread: 2.5, awaySpreadOdds: -104, total: 43.5, overOdds: -104, underOdds: -118 },
  { homeML: -116, awayML: -102, homeSpread: -1.5, homeSpreadOdds: -105, awaySpread: 1.5, awaySpreadOdds: -115, total: 49.5, overOdds: -110, underOdds: -110 },
  { homeML: 106, awayML: -124, homeSpread: 1.5, homeSpreadOdds: -112, awaySpread: -1.5, awaySpreadOdds: -108, total: 44.5, overOdds: -102, underOdds: -120 },
  { homeML: -106, awayML: -110, homeSpread: -1.5, homeSpreadOdds: 100, awaySpread: 1.5, awaySpreadOdds: -122, total: 40.5, overOdds: -115, underOdds: -105 },
  { homeML: 108, awayML: -126, homeSpread: 1.5, homeSpreadOdds: -105, awaySpread: -1.5, awaySpreadOdds: -115, total: 40.5, overOdds: -115, underOdds: -105 },
  { homeML: 188, awayML: -225, homeSpread: 3.5, homeSpreadOdds: -102, awaySpread: -3.5, awaySpreadOdds: -120, total: 49.5, overOdds: -105, underOdds: -115 },
  { homeML: -210, awayML: 176, homeSpread: -4.5, homeSpreadOdds: -104, awaySpread: 4.5, awaySpreadOdds: -118, total: 47.5, overOdds: -105, underOdds: -115 },
  { homeML: -240, awayML: 198, homeSpread: -5.5, homeSpreadOdds: -105, awaySpread: 5.5, awaySpreadOdds: -115, total: 48.5, overOdds: -108, underOdds: -112 },
  { homeML: -134, awayML: 114, homeSpread: -2.5, homeSpreadOdds: -110, awaySpread: 2.5, awaySpreadOdds: -110, total: 53.5, overOdds: -112, underOdds: -108 },
  { homeML: -118, awayML: 100, homeSpread: -1.5, homeSpreadOdds: -108, awaySpread: 1.5, awaySpreadOdds: -112, total: 49.5, overOdds: -115, underOdds: -105 },
  { homeML: -148, awayML: 126, homeSpread: -2.5, homeSpreadOdds: -118, awaySpread: 2.5, awaySpreadOdds: -104, total: 50.5, overOdds: -105, underOdds: -115 },
  { homeML: 104, awayML: -122, homeSpread: 1.5, homeSpreadOdds: -110, awaySpread: -1.5, awaySpreadOdds: -110, total: 39.5, overOdds: -110, underOdds: -110 },
  { homeML: -130, awayML: 110, homeSpread: -2.5, homeSpreadOdds: -105, awaySpread: 2.5, awaySpreadOdds: -115, total: 37.5, overOdds: -120, underOdds: -102 },
  { homeML: -118, awayML: 100, homeSpread: -1.5, homeSpreadOdds: -105, awaySpread: 1.5, awaySpreadOdds: -115, total: 47.5, overOdds: -112, underOdds: -108 },
  { homeML: 112, awayML: -132, homeSpread: 1.5, homeSpreadOdds: -105, awaySpread: -1.5, awaySpreadOdds: -115, total: 46.5, overOdds: -118, underOdds: -104 },
  { homeML: -104, awayML: -112, homeSpread: 1.5, homeSpreadOdds: -118, awaySpread: -1.5, awaySpreadOdds: -104, total: 45.5, overOdds: -110, underOdds: -110 },
];

function hashTeams(homeTeam: string, awayTeam: string): number {
  const s = `${homeTeam}|${awayTeam}`;
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function fakeLinesForGame(homeTeam: string, awayTeam: string) {
  const t = REAL_GAME_LINES[hashTeams(homeTeam, awayTeam) % REAL_GAME_LINES.length];
  return [
    { market: "MONEYLINE_HOME", label: `${homeTeam} ML`, odds: t.homeML, line: null as number | null },
    { market: "MONEYLINE_AWAY", label: `${awayTeam} ML`, odds: t.awayML, line: null as number | null },
    { market: "SPREAD_HOME", label: `${homeTeam} ${t.homeSpread > 0 ? "+" : ""}${t.homeSpread}`, odds: t.homeSpreadOdds, line: t.homeSpread as number | null },
    { market: "SPREAD_AWAY", label: `${awayTeam} ${t.awaySpread > 0 ? "+" : ""}${t.awaySpread}`, odds: t.awaySpreadOdds, line: t.awaySpread as number | null },
    { market: "TOTAL_OVER", label: `Over ${t.total}`, odds: t.overOdds, line: t.total as number | null },
    { market: "TOTAL_UNDER", label: `Under ${t.total}`, odds: t.underOdds, line: t.total as number | null },
  ];
}

export async function seedFakePropsForWeek(weekId: string): Promise<{ lines: number; props: number }> {
  const week = await db.query.weeks.findFirst({
    where: eq(weeks.id, weekId),
    with: { games: true },
  });
  if (!week) throw new Error("Week not found");

  const weekGames = (week as any).games as Array<{ id: string; homeTeam: string; awayTeam: string; externalId: string | null }>;

  // Games with externalId have real SharpAPI odds — never overwrite their
  // main ML/spread/total; center their fake alt ladders on the real lines
  const weekGameIds = weekGames.map((g) => g.id);
  const MAIN_MARKETS = ["MONEYLINE_HOME", "MONEYLINE_AWAY", "SPREAD_HOME", "SPREAD_AWAY", "TOTAL_OVER", "TOTAL_UNDER"];
  const existingMains = weekGameIds.length > 0
    ? await db.select().from(gameLines).where(and(inArray(gameLines.gameId, weekGameIds), inArray(gameLines.market, MAIN_MARKETS)))
    : [];
  const mainsByGame = new Map<string, Map<string, number | null>>();
  for (const gl of existingMains) {
    let m = mainsByGame.get(gl.gameId);
    if (!m) { m = new Map(); mainsByGame.set(gl.gameId, m); }
    m.set(gl.market, gl.line);
  }

  // Build all game line records in memory
  const allGameLineValues: Array<{ gameId: string; market: string; label: string; odds: number; line: number | null }> = [];
  for (const game of weekGames) {
    const realMains = game.externalId ? mainsByGame.get(game.id) : undefined;
    const baseLines = fakeLinesForGame(game.homeTeam, game.awayTeam);
    if (!realMains) {
      for (const gl of baseLines) {
        allGameLineValues.push({ gameId: game.id, ...gl });
      }
    }
    const spreadBase = realMains?.get("SPREAD_HOME") ?? baseLines.find((l) => l.market === "SPREAD_HOME")?.line;
    const totalBase  = realMains?.get("TOTAL_OVER") ?? baseLines.find((l) => l.market === "TOTAL_OVER")?.line;
    if (spreadBase != null && totalBase != null) {
      for (const al of fakeAltGameLines(game.homeTeam, game.awayTeam, spreadBase, totalBase)) {
        allGameLineValues.push({ gameId: game.id, ...al });
      }
    }
  }

  // Determine which FAKE_PLAYERS are needed for this week's games
  const teamSet = new Set(weekGames.flatMap((g) => [g.homeTeam, g.awayTeam]));
  const neededPlayers = FAKE_PLAYERS.filter((p) => teamSet.has(p.team));

  // Pre-fetch all known players in one query, key by "name:team"
  const allExisting = neededPlayers.length > 0
    ? await db.select().from(players).where(
        inArray(players.name, [...new Set(neededPlayers.map((p) => p.name))])
      )
    : [];
  const playerByKey = new Map(allExisting.map((p) => [`${p.name}:${p.team}`, p]));

  // Insert any missing players in one bulk call
  const toInsert = neededPlayers.filter((p) => !playerByKey.has(`${p.name}:${p.team}`));
  const uniqueToInsert = [...new Map(toInsert.map((p) => [`${p.name}:${p.team}`, p])).values()];
  if (uniqueToInsert.length > 0) {
    const inserted = await db.insert(players)
      .values(uniqueToInsert.map((p) => ({ name: p.name, team: p.team, position: p.position })))
      .onConflictDoNothing()
      .returning();
    for (const p of inserted) playerByKey.set(`${p.name}:${p.team}`, p);
    // Re-fetch any that were skipped by onConflictDoNothing
    const stillMissing = uniqueToInsert.filter((p) => !playerByKey.has(`${p.name}:${p.team}`));
    if (stillMissing.length > 0) {
      const refetched = await db.select().from(players)
        .where(inArray(players.name, stillMissing.map((p) => p.name)));
      for (const p of refetched) playerByKey.set(`${p.name}:${p.team}`, p);
    }
  }

  // Build all prop records in memory
  const allPropValues: Array<{ gameId: string; playerId: string; statType: any; line: number; odds: number }> = [];
  for (const game of weekGames) {
    const teamNames = [game.homeTeam, game.awayTeam];
    const gamePlayers = neededPlayers.filter((p) => teamNames.includes(p.team));
    for (const team of teamNames) {
      const teamPlayers = gamePlayers.filter((p) => p.team === team);
      for (const [pos, slotCount] of Object.entries(SLOTS)) {
        const posPlayers = teamPlayers.filter((p) => p.position === pos).slice(0, slotCount);
        const propTemplate = POSITION_PROPS[pos];
        if (!propTemplate) continue;
        for (const fp of posPlayers) {
          const player = playerByKey.get(`${fp.name}:${fp.team}`);
          if (!player) continue;
          for (const { statType, line, odds } of propTemplate) {
            allPropValues.push({ gameId: game.id, playerId: player.id, statType: statType as any, line: fakeVariant(line), odds });
          }
        }
      }
    }
  }

  // Bulk upsert game lines (unique on gameId+market)
  if (allGameLineValues.length > 0) {
    await db.insert(gameLines)
      .values(allGameLineValues)
      .onConflictDoUpdate({
        target: [gameLines.gameId, gameLines.market],
        set: { label: sql`excluded.label`, odds: sql`excluded.odds`, line: sql`excluded.line` },
      });
  }

  // Bulk upsert props (unique on gameId+playerId+statType)
  if (allPropValues.length > 0) {
    await db.insert(props)
      .values(allPropValues)
      .onConflictDoUpdate({
        target: [props.gameId, props.playerId, props.statType],
        set: { line: sql`excluded.line`, odds: sql`excluded.odds` },
      });
  }

  return { lines: allGameLineValues.length, props: allPropValues.length };
}
