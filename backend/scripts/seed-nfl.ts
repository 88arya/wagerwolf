import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import * as dotenv from "dotenv";

dotenv.config();

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_DIRECT_URL! });
const prisma = new PrismaClient({ adapter } as any);

// ─── Player roster ──────────────────────────────────────────────────────────
const PLAYERS = [
  { name: "Patrick Mahomes",    team: "KC",  position: "QB" },
  { name: "Josh Allen",         team: "BUF", position: "QB" },
  { name: "Lamar Jackson",      team: "BAL", position: "QB" },
  { name: "Joe Burrow",         team: "CIN", position: "QB" },
  { name: "Jared Goff",         team: "DET", position: "QB" },
  { name: "Dak Prescott",       team: "DAL", position: "QB" },
  { name: "Tua Tagovailoa",     team: "MIA", position: "QB" },
  { name: "Brock Purdy",        team: "SF",  position: "QB" },
  { name: "Jordan Love",        team: "GB",  position: "QB" },
  { name: "Jalen Hurts",        team: "PHI", position: "QB" },
  { name: "Geno Smith",         team: "SEA", position: "QB" },
  { name: "Matthew Stafford",   team: "LAR", position: "QB" },
  { name: "Sam Darnold",        team: "MIN", position: "QB" },
  { name: "Travis Kelce",       team: "KC",  position: "TE" },
  { name: "Mark Andrews",       team: "BAL", position: "TE" },
  { name: "Sam LaPorta",        team: "DET", position: "TE" },
  { name: "Dallas Goedert",     team: "PHI", position: "TE" },
  { name: "Derrick Henry",      team: "BAL", position: "RB" },
  { name: "Saquon Barkley",     team: "PHI", position: "RB" },
  { name: "Josh Jacobs",        team: "GB",  position: "RB" },
  { name: "De'Von Achane",      team: "MIA", position: "RB" },
  { name: "James Cook",         team: "BUF", position: "RB" },
  { name: "Christian McCaffrey",team: "SF",  position: "RB" },
  { name: "Aaron Jones",        team: "MIN", position: "RB" },
  { name: "CeeDee Lamb",        team: "DAL", position: "WR" },
  { name: "Tyreek Hill",        team: "MIA", position: "WR" },
  { name: "Justin Jefferson",   team: "MIN", position: "WR" },
  { name: "Davante Adams",      team: "LV",  position: "WR" },
  { name: "Amon-Ra St. Brown",  team: "DET", position: "WR" },
  { name: "Puka Nacua",         team: "LAR", position: "WR" },
  { name: "Ja'Marr Chase",      team: "CIN", position: "WR" },
  { name: "Deebo Samuel",       team: "SF",  position: "WR" },
  { name: "Malik Nabers",       team: "NYG", position: "WR" },
  { name: "Jaylen Waddle",      team: "MIA", position: "WR" },
  { name: "DJ Moore",           team: "CHI", position: "WR" },
];

// ─── Season data ─────────────────────────────────────────────────────────────
interface PropData {
  playerName: string;
  statType: "PASSING_YARDS" | "RUSHING_YARDS" | "RECEIVING_YARDS" | "TOUCHDOWNS" | "RECEPTIONS";
  line: number;
  result: number;
  odds?: number;
}
interface GameData {
  homeTeam: string; awayTeam: string;
  homeScore: number; awayScore: number;
  gameDayOffset: number; // days from week startDate (0=Thu, 3=Sun, 4=Mon)
  spread: number; // home team's spread (negative = home favored)
  total: number;
  homeMoneyline: number; awayMoneyline: number;
  props: PropData[];
}
interface WeekData {
  number: number;
  startDate: string; endDate: string;
  games: GameData[];
}

const NFL_SEASON: WeekData[] = [
  {
    number: 1, startDate: "2024-09-05", endDate: "2024-09-09",
    games: [
      { homeTeam: "KC", awayTeam: "BAL", homeScore: 27, awayScore: 20, gameDayOffset: 0, spread: -3.5, total: 51.5, homeMoneyline: -185, awayMoneyline: 155,
        props: [
          { playerName: "Patrick Mahomes",  statType: "PASSING_YARDS",  line: 270.5, result: 284, odds: -115 },
          { playerName: "Travis Kelce",      statType: "RECEPTIONS",     line: 5.5,   result: 8,   odds: -120 },
          { playerName: "Lamar Jackson",     statType: "PASSING_YARDS",  line: 255.5, result: 241, odds: -115 },
          { playerName: "Derrick Henry",     statType: "RUSHING_YARDS",  line: 75.5,  result: 89,  odds: -115 },
        ],
      },
      { homeTeam: "DAL", awayTeam: "PHI", homeScore: 17, awayScore: 28, gameDayOffset: 3, spread: 3, total: 44.5, homeMoneyline: 135, awayMoneyline: -160,
        props: [
          { playerName: "Dak Prescott",     statType: "PASSING_YARDS",  line: 245.5, result: 218, odds: -110 },
          { playerName: "CeeDee Lamb",       statType: "RECEIVING_YARDS",line: 80.5,  result: 89,  odds: -115 },
          { playerName: "Jalen Hurts",       statType: "PASSING_YARDS",  line: 215.5, result: 231, odds: -110 },
          { playerName: "Saquon Barkley",    statType: "RUSHING_YARDS",  line: 75.5,  result: 112, odds: -115 },
        ],
      },
      { homeTeam: "SF", awayTeam: "SEA", homeScore: 30, awayScore: 13, gameDayOffset: 3, spread: -7.5, total: 44.5, homeMoneyline: -300, awayMoneyline: 245,
        props: [
          { playerName: "Brock Purdy",       statType: "PASSING_YARDS",  line: 245.5, result: 267, odds: -115 },
          { playerName: "Christian McCaffrey",statType: "RUSHING_YARDS",  line: 85.5,  result: 112, odds: -120 },
          { playerName: "Deebo Samuel",       statType: "RECEIVING_YARDS",line: 55.5,  result: 64,  odds: -110 },
          { playerName: "Geno Smith",         statType: "PASSING_YARDS",  line: 235.5, result: 189, odds: -110 },
        ],
      },
    ],
  },
  {
    number: 2, startDate: "2024-09-12", endDate: "2024-09-16",
    games: [
      { homeTeam: "BUF", awayTeam: "MIA", homeScore: 31, awayScore: 10, gameDayOffset: 0, spread: -6, total: 53.5, homeMoneyline: -255, awayMoneyline: 210,
        props: [
          { playerName: "Josh Allen",        statType: "PASSING_YARDS",  line: 265.5, result: 289, odds: -115 },
          { playerName: "James Cook",         statType: "RUSHING_YARDS",  line: 65.5,  result: 78,  odds: -110 },
          { playerName: "Tua Tagovailoa",    statType: "PASSING_YARDS",  line: 270.5, result: 201, odds: -115 },
          { playerName: "Tyreek Hill",        statType: "RECEIVING_YARDS",line: 85.5,  result: 67,  odds: -115 },
        ],
      },
      { homeTeam: "DET", awayTeam: "GB", homeScore: 24, awayScore: 21, gameDayOffset: 3, spread: -2.5, total: 48.5, homeMoneyline: -145, awayMoneyline: 125,
        props: [
          { playerName: "Jared Goff",         statType: "PASSING_YARDS",  line: 255.5, result: 271, odds: -110 },
          { playerName: "Amon-Ra St. Brown",  statType: "RECEIVING_YARDS",line: 75.5,  result: 88,  odds: -115 },
          { playerName: "Jordan Love",         statType: "PASSING_YARDS",  line: 240.5, result: 226, odds: -110 },
          { playerName: "Josh Jacobs",         statType: "RUSHING_YARDS",  line: 70.5,  result: 65,  odds: -115 },
        ],
      },
      { homeTeam: "LAR", awayTeam: "SF", homeScore: 19, awayScore: 27, gameDayOffset: 4, spread: 3.5, total: 46.5, homeMoneyline: 160, awayMoneyline: -190,
        props: [
          { playerName: "Matthew Stafford",  statType: "PASSING_YARDS",  line: 235.5, result: 224, odds: -110 },
          { playerName: "Puka Nacua",         statType: "RECEIVING_YARDS",line: 70.5,  result: 83,  odds: -115 },
          { playerName: "Brock Purdy",        statType: "PASSING_YARDS",  line: 240.5, result: 261, odds: -110 },
          { playerName: "Christian McCaffrey",statType: "RUSHING_YARDS",  line: 80.5,  result: 97,  odds: -120 },
        ],
      },
    ],
  },
  {
    number: 3, startDate: "2024-09-19", endDate: "2024-09-23",
    games: [
      { homeTeam: "CIN", awayTeam: "BAL", homeScore: 17, awayScore: 23, gameDayOffset: 0, spread: 2.5, total: 46.5, homeMoneyline: 125, awayMoneyline: -150,
        props: [
          { playerName: "Joe Burrow",         statType: "PASSING_YARDS",  line: 255.5, result: 234, odds: -110 },
          { playerName: "Ja'Marr Chase",      statType: "RECEIVING_YARDS",line: 80.5,  result: 71,  odds: -115 },
          { playerName: "Lamar Jackson",      statType: "PASSING_YARDS",  line: 250.5, result: 268, odds: -115 },
          { playerName: "Derrick Henry",      statType: "RUSHING_YARDS",  line: 80.5,  result: 103, odds: -115 },
        ],
      },
      { homeTeam: "KC", awayTeam: "LV", homeScore: 30, awayScore: 29, gameDayOffset: 3, spread: -9, total: 47.5, homeMoneyline: -370, awayMoneyline: 300,
        props: [
          { playerName: "Patrick Mahomes",  statType: "PASSING_YARDS",  line: 275.5, result: 294, odds: -115 },
          { playerName: "Travis Kelce",      statType: "RECEIVING_YARDS",line: 65.5,  result: 72,  odds: -115 },
          { playerName: "Davante Adams",     statType: "RECEIVING_YARDS",line: 75.5,  result: 127, odds: -115 },
        ],
      },
      { homeTeam: "PHI", awayTeam: "DAL", homeScore: 22, awayScore: 16, gameDayOffset: 4, spread: -5, total: 43.5, homeMoneyline: -215, awayMoneyline: 178,
        props: [
          { playerName: "Jalen Hurts",       statType: "PASSING_YARDS",  line: 225.5, result: 241, odds: -110 },
          { playerName: "Saquon Barkley",    statType: "RUSHING_YARDS",  line: 80.5,  result: 94,  odds: -115 },
          { playerName: "Dak Prescott",      statType: "PASSING_YARDS",  line: 250.5, result: 228, odds: -110 },
          { playerName: "CeeDee Lamb",       statType: "RECEIVING_YARDS",line: 85.5,  result: 78,  odds: -115 },
        ],
      },
    ],
  },
  {
    number: 4, startDate: "2024-09-26", endDate: "2024-09-30",
    games: [
      { homeTeam: "MIN", awayTeam: "GB", homeScore: 31, awayScore: 29, gameDayOffset: 0, spread: -1.5, total: 51.5, homeMoneyline: -130, awayMoneyline: 110,
        props: [
          { playerName: "Justin Jefferson",  statType: "RECEIVING_YARDS",line: 85.5,  result: 103, odds: -115 },
          { playerName: "Sam Darnold",        statType: "PASSING_YARDS",  line: 225.5, result: 241, odds: -110 },
          { playerName: "Jordan Love",        statType: "PASSING_YARDS",  line: 245.5, result: 268, odds: -110 },
          { playerName: "Josh Jacobs",        statType: "RUSHING_YARDS",  line: 68.5,  result: 75,  odds: -110 },
        ],
      },
      { homeTeam: "MIA", awayTeam: "BUF", homeScore: 28, awayScore: 23, gameDayOffset: 3, spread: 2, total: 52.5, homeMoneyline: 108, awayMoneyline: -128,
        props: [
          { playerName: "Tua Tagovailoa",    statType: "PASSING_YARDS",  line: 260.5, result: 294, odds: -115 },
          { playerName: "Tyreek Hill",        statType: "RECEIVING_YARDS",line: 90.5,  result: 112, odds: -115 },
          { playerName: "Josh Allen",         statType: "PASSING_YARDS",  line: 275.5, result: 252, odds: -115 },
          { playerName: "De'Von Achane",      statType: "RUSHING_YARDS",  line: 65.5,  result: 81,  odds: -115 },
        ],
      },
      { homeTeam: "SEA", awayTeam: "LAR", homeScore: 26, awayScore: 20, gameDayOffset: 4, spread: -3, total: 45.5, homeMoneyline: -165, awayMoneyline: 140,
        props: [
          { playerName: "Geno Smith",         statType: "PASSING_YARDS",  line: 230.5, result: 251, odds: -110 },
          { playerName: "Puka Nacua",         statType: "RECEIVING_YARDS",line: 72.5,  result: 65,  odds: -115 },
          { playerName: "Matthew Stafford",  statType: "PASSING_YARDS",  line: 238.5, result: 219, odds: -110 },
        ],
      },
    ],
  },
  {
    number: 5, startDate: "2024-10-03", endDate: "2024-10-07",
    games: [
      { homeTeam: "BAL", awayTeam: "PHI", homeScore: 24, awayScore: 19, gameDayOffset: 0, spread: -4.5, total: 45.5, homeMoneyline: -200, awayMoneyline: 168,
        props: [
          { playerName: "Lamar Jackson",     statType: "PASSING_YARDS",  line: 245.5, result: 231, odds: -115 },
          { playerName: "Derrick Henry",     statType: "RUSHING_YARDS",  line: 85.5,  result: 98,  odds: -120 },
          { playerName: "Jalen Hurts",       statType: "PASSING_YARDS",  line: 220.5, result: 214, odds: -110 },
          { playerName: "Saquon Barkley",    statType: "RUSHING_YARDS",  line: 78.5,  result: 71,  odds: -115 },
        ],
      },
      { homeTeam: "GB", awayTeam: "MIN", homeScore: 34, awayScore: 31, gameDayOffset: 3, spread: -3, total: 53.5, homeMoneyline: -155, awayMoneyline: 130,
        props: [
          { playerName: "Jordan Love",        statType: "PASSING_YARDS",  line: 255.5, result: 288, odds: -110 },
          { playerName: "Josh Jacobs",        statType: "RUSHING_YARDS",  line: 72.5,  result: 88,  odds: -110 },
          { playerName: "Justin Jefferson",  statType: "RECEIVING_YARDS",line: 88.5,  result: 96,  odds: -115 },
          { playerName: "Sam Darnold",        statType: "PASSING_YARDS",  line: 235.5, result: 247, odds: -110 },
        ],
      },
      { homeTeam: "KC", awayTeam: "DEN", homeScore: 28, awayScore: 9, gameDayOffset: 4, spread: -12.5, total: 43.5, homeMoneyline: -550, awayMoneyline: 415,
        props: [
          { playerName: "Patrick Mahomes",  statType: "PASSING_YARDS",  line: 265.5, result: 278, odds: -115 },
          { playerName: "Travis Kelce",      statType: "RECEIVING_YARDS",line: 68.5,  result: 79,  odds: -115 },
          { playerName: "Travis Kelce",      statType: "RECEPTIONS",     line: 5.5,   result: 7,   odds: -120 },
        ],
      },
    ],
  },
  {
    number: 6, startDate: "2024-10-10", endDate: "2024-10-14",
    games: [
      { homeTeam: "CIN", awayTeam: "PIT", homeScore: 20, awayScore: 44, gameDayOffset: 0, spread: -6.5, total: 42.5, homeMoneyline: -240, awayMoneyline: 198,
        props: [
          { playerName: "Joe Burrow",         statType: "PASSING_YARDS",  line: 265.5, result: 224, odds: -110 },
          { playerName: "Ja'Marr Chase",      statType: "RECEIVING_YARDS",line: 85.5,  result: 67,  odds: -115 },
        ],
      },
      { homeTeam: "BUF", awayTeam: "NYJ", homeScore: 23, awayScore: 20, gameDayOffset: 3, spread: -8, total: 43.5, homeMoneyline: -320, awayMoneyline: 262,
        props: [
          { playerName: "Josh Allen",         statType: "PASSING_YARDS",  line: 270.5, result: 248, odds: -115 },
          { playerName: "Josh Allen",         statType: "RUSHING_YARDS",  line: 38.5,  result: 54,  odds: -115 },
          { playerName: "James Cook",         statType: "RUSHING_YARDS",  line: 62.5,  result: 48,  odds: -110 },
        ],
      },
      { homeTeam: "DET", awayTeam: "SEA", homeScore: 42, awayScore: 29, gameDayOffset: 4, spread: -6, total: 52.5, homeMoneyline: -235, awayMoneyline: 194,
        props: [
          { playerName: "Jared Goff",         statType: "PASSING_YARDS",  line: 260.5, result: 301, odds: -110 },
          { playerName: "Amon-Ra St. Brown",  statType: "RECEIVING_YARDS",line: 78.5,  result: 94,  odds: -115 },
          { playerName: "Sam LaPorta",        statType: "RECEIVING_YARDS",line: 45.5,  result: 61,  odds: -110 },
          { playerName: "Geno Smith",         statType: "PASSING_YARDS",  line: 245.5, result: 267, odds: -110 },
        ],
      },
    ],
  },
  {
    number: 7, startDate: "2024-10-17", endDate: "2024-10-21",
    games: [
      { homeTeam: "SF", awayTeam: "KC", homeScore: 24, awayScore: 28, gameDayOffset: 0, spread: -3, total: 50.5, homeMoneyline: -155, awayMoneyline: 130,
        props: [
          { playerName: "Brock Purdy",        statType: "PASSING_YARDS",  line: 255.5, result: 248, odds: -115 },
          { playerName: "Christian McCaffrey",statType: "RUSHING_YARDS",  line: 88.5,  result: 74,  odds: -120 },
          { playerName: "Patrick Mahomes",  statType: "PASSING_YARDS",  line: 268.5, result: 287, odds: -115 },
          { playerName: "Travis Kelce",      statType: "RECEIVING_YARDS",line: 70.5,  result: 84,  odds: -115 },
        ],
      },
      { homeTeam: "MIN", awayTeam: "DET", homeScore: 31, awayScore: 29, gameDayOffset: 3, spread: -2.5, total: 54.5, homeMoneyline: -140, awayMoneyline: 120,
        props: [
          { playerName: "Justin Jefferson",  statType: "RECEIVING_YARDS",line: 90.5,  result: 105, odds: -115 },
          { playerName: "Sam Darnold",        statType: "PASSING_YARDS",  line: 230.5, result: 252, odds: -110 },
          { playerName: "Jared Goff",         statType: "PASSING_YARDS",  line: 265.5, result: 278, odds: -110 },
          { playerName: "Amon-Ra St. Brown",  statType: "RECEIVING_YARDS",line: 80.5,  result: 76,  odds: -115 },
        ],
      },
      { homeTeam: "DAL", awayTeam: "LAR", homeScore: 20, awayScore: 23, gameDayOffset: 4, spread: -4, total: 44.5, homeMoneyline: -185, awayMoneyline: 156,
        props: [
          { playerName: "Dak Prescott",       statType: "PASSING_YARDS",  line: 248.5, result: 234, odds: -110 },
          { playerName: "CeeDee Lamb",        statType: "RECEIVING_YARDS",line: 88.5,  result: 72,  odds: -115 },
          { playerName: "Matthew Stafford",  statType: "PASSING_YARDS",  line: 232.5, result: 258, odds: -110 },
          { playerName: "Puka Nacua",         statType: "RECEIVING_YARDS",line: 68.5,  result: 87,  odds: -115 },
        ],
      },
    ],
  },
  {
    number: 8, startDate: "2024-10-24", endDate: "2024-10-28",
    games: [
      { homeTeam: "MIA", awayTeam: "BUF", homeScore: 14, awayScore: 30, gameDayOffset: 0, spread: 5.5, total: 52.5, homeMoneyline: 215, awayMoneyline: -260,
        props: [
          { playerName: "Tua Tagovailoa",    statType: "PASSING_YARDS",  line: 258.5, result: 201, odds: -115 },
          { playerName: "Tyreek Hill",        statType: "RECEIVING_YARDS",line: 88.5,  result: 63,  odds: -115 },
          { playerName: "Josh Allen",         statType: "PASSING_YARDS",  line: 272.5, result: 296, odds: -115 },
          { playerName: "James Cook",         statType: "RUSHING_YARDS",  line: 65.5,  result: 88,  odds: -110 },
        ],
      },
      { homeTeam: "GB", awayTeam: "CHI", homeScore: 28, awayScore: 10, gameDayOffset: 3, spread: -9.5, total: 44.5, homeMoneyline: -390, awayMoneyline: 315,
        props: [
          { playerName: "Jordan Love",        statType: "PASSING_YARDS",  line: 252.5, result: 284, odds: -110 },
          { playerName: "Josh Jacobs",        statType: "RUSHING_YARDS",  line: 74.5,  result: 91,  odds: -110 },
          { playerName: "DJ Moore",           statType: "RECEIVING_YARDS",line: 62.5,  result: 44,  odds: -115 },
        ],
      },
      { homeTeam: "BAL", awayTeam: "CIN", homeScore: 35, awayScore: 34, gameDayOffset: 4, spread: -5.5, total: 55.5, homeMoneyline: -215, awayMoneyline: 178,
        props: [
          { playerName: "Lamar Jackson",     statType: "PASSING_YARDS",  line: 248.5, result: 258, odds: -115 },
          { playerName: "Mark Andrews",      statType: "RECEIVING_YARDS",line: 55.5,  result: 78,  odds: -115 },
          { playerName: "Joe Burrow",         statType: "PASSING_YARDS",  line: 268.5, result: 297, odds: -110 },
          { playerName: "Ja'Marr Chase",     statType: "RECEIVING_YARDS",line: 88.5,  result: 101, odds: -115 },
        ],
      },
    ],
  },
  {
    number: 9, startDate: "2024-10-31", endDate: "2024-11-04",
    games: [
      { homeTeam: "KC", awayTeam: "BUF", homeScore: 30, awayScore: 21, gameDayOffset: 0, spread: -4, total: 52.5, homeMoneyline: -190, awayMoneyline: 160,
        props: [
          { playerName: "Patrick Mahomes",  statType: "PASSING_YARDS",  line: 272.5, result: 291, odds: -115 },
          { playerName: "Travis Kelce",      statType: "RECEIVING_YARDS",line: 72.5,  result: 89,  odds: -115 },
          { playerName: "Josh Allen",         statType: "PASSING_YARDS",  line: 275.5, result: 248, odds: -115 },
          { playerName: "James Cook",         statType: "RUSHING_YARDS",  line: 62.5,  result: 54,  odds: -110 },
        ],
      },
      { homeTeam: "DAL", awayTeam: "PHI", homeScore: 27, awayScore: 34, gameDayOffset: 3, spread: 2, total: 47.5, homeMoneyline: 108, awayMoneyline: -130,
        props: [
          { playerName: "Dak Prescott",      statType: "PASSING_YARDS",  line: 252.5, result: 278, odds: -110 },
          { playerName: "CeeDee Lamb",       statType: "RECEIVING_YARDS",line: 90.5,  result: 103, odds: -115 },
          { playerName: "Jalen Hurts",       statType: "PASSING_YARDS",  line: 225.5, result: 247, odds: -110 },
          { playerName: "Saquon Barkley",    statType: "RUSHING_YARDS",  line: 82.5,  result: 115, odds: -115 },
        ],
      },
      { homeTeam: "SF", awayTeam: "LAR", homeScore: 24, awayScore: 21, gameDayOffset: 4, spread: -5.5, total: 45.5, homeMoneyline: -218, awayMoneyline: 182,
        props: [
          { playerName: "Brock Purdy",        statType: "PASSING_YARDS",  line: 248.5, result: 234, odds: -115 },
          { playerName: "Christian McCaffrey",statType: "RUSHING_YARDS",  line: 90.5,  result: 78,  odds: -120 },
          { playerName: "Matthew Stafford",  statType: "PASSING_YARDS",  line: 230.5, result: 218, odds: -110 },
        ],
      },
    ],
  },
  {
    number: 10, startDate: "2024-11-07", endDate: "2024-11-11",
    games: [
      { homeTeam: "BAL", awayTeam: "CIN", homeScore: 31, awayScore: 14, gameDayOffset: 0, spread: -8, total: 48.5, homeMoneyline: -320, awayMoneyline: 262,
        props: [
          { playerName: "Lamar Jackson",     statType: "RUSHING_YARDS",  line: 55.5,  result: 77,  odds: -120 },
          { playerName: "Lamar Jackson",     statType: "PASSING_YARDS",  line: 252.5, result: 234, odds: -115 },
          { playerName: "Derrick Henry",     statType: "RUSHING_YARDS",  line: 88.5,  result: 121, odds: -120 },
          { playerName: "Joe Burrow",         statType: "PASSING_YARDS",  line: 262.5, result: 214, odds: -110 },
        ],
      },
      { homeTeam: "DET", awayTeam: "MIN", homeScore: 27, awayScore: 23, gameDayOffset: 3, spread: -4, total: 51.5, homeMoneyline: -190, awayMoneyline: 160,
        props: [
          { playerName: "Jared Goff",         statType: "PASSING_YARDS",  line: 262.5, result: 271, odds: -110 },
          { playerName: "Amon-Ra St. Brown",  statType: "RECEIVING_YARDS",line: 82.5,  result: 91,  odds: -115 },
          { playerName: "Justin Jefferson",  statType: "RECEIVING_YARDS",line: 85.5,  result: 78,  odds: -115 },
          { playerName: "Sam Darnold",        statType: "PASSING_YARDS",  line: 238.5, result: 224, odds: -110 },
        ],
      },
      { homeTeam: "LAR", awayTeam: "SEA", homeScore: 30, awayScore: 20, gameDayOffset: 4, spread: -6, total: 48.5, homeMoneyline: -238, awayMoneyline: 198,
        props: [
          { playerName: "Matthew Stafford",  statType: "PASSING_YARDS",  line: 235.5, result: 267, odds: -110 },
          { playerName: "Puka Nacua",         statType: "RECEIVING_YARDS",line: 75.5,  result: 92,  odds: -115 },
          { playerName: "Geno Smith",         statType: "PASSING_YARDS",  line: 238.5, result: 218, odds: -110 },
        ],
      },
    ],
  },
  {
    number: 11, startDate: "2024-11-14", endDate: "2024-11-18",
    games: [
      { homeTeam: "BUF", awayTeam: "KC", homeScore: 30, awayScore: 26, gameDayOffset: 0, spread: -2.5, total: 52.5, homeMoneyline: -148, awayMoneyline: 125,
        props: [
          { playerName: "Josh Allen",         statType: "PASSING_YARDS",  line: 278.5, result: 302, odds: -115 },
          { playerName: "Josh Allen",         statType: "RUSHING_YARDS",  line: 42.5,  result: 58,  odds: -115 },
          { playerName: "Patrick Mahomes",  statType: "PASSING_YARDS",  line: 278.5, result: 264, odds: -115 },
          { playerName: "Travis Kelce",      statType: "RECEIVING_YARDS",line: 68.5,  result: 57,  odds: -115 },
        ],
      },
      { homeTeam: "GB", awayTeam: "DET", homeScore: 22, awayScore: 34, gameDayOffset: 3, spread: 4, total: 54.5, homeMoneyline: 175, awayMoneyline: -210,
        props: [
          { playerName: "Jordan Love",        statType: "PASSING_YARDS",  line: 248.5, result: 231, odds: -110 },
          { playerName: "Josh Jacobs",        statType: "RUSHING_YARDS",  line: 68.5,  result: 54,  odds: -110 },
          { playerName: "Jared Goff",         statType: "PASSING_YARDS",  line: 258.5, result: 284, odds: -110 },
          { playerName: "Amon-Ra St. Brown",  statType: "RECEIVING_YARDS",line: 80.5,  result: 99,  odds: -115 },
        ],
      },
      { homeTeam: "PHI", awayTeam: "NYG", homeScore: 34, awayScore: 20, gameDayOffset: 4, spread: -11, total: 45.5, homeMoneyline: -450, awayMoneyline: 355,
        props: [
          { playerName: "Jalen Hurts",       statType: "PASSING_YARDS",  line: 218.5, result: 238, odds: -110 },
          { playerName: "Saquon Barkley",    statType: "RUSHING_YARDS",  line: 85.5,  result: 128, odds: -115 },
          { playerName: "Dallas Goedert",    statType: "RECEIVING_YARDS",line: 55.5,  result: 67,  odds: -110 },
          { playerName: "Malik Nabers",      statType: "RECEIVING_YARDS",line: 68.5,  result: 59,  odds: -115 },
        ],
      },
    ],
  },
  {
    number: 12, startDate: "2024-11-21", endDate: "2024-11-25",
    games: [
      { homeTeam: "SF", awayTeam: "PHI", homeScore: 14, awayScore: 17, gameDayOffset: 0, spread: -6, total: 43.5, homeMoneyline: -240, awayMoneyline: 200,
        props: [
          { playerName: "Brock Purdy",        statType: "PASSING_YARDS",  line: 242.5, result: 201, odds: -115 },
          { playerName: "Christian McCaffrey",statType: "RUSHING_YARDS",  line: 84.5,  result: 62,  odds: -120 },
          { playerName: "Jalen Hurts",        statType: "PASSING_YARDS",  line: 212.5, result: 224, odds: -110 },
          { playerName: "Saquon Barkley",    statType: "RUSHING_YARDS",  line: 80.5,  result: 71,  odds: -115 },
        ],
      },
      { homeTeam: "BAL", awayTeam: "PIT", homeScore: 16, awayScore: 24, gameDayOffset: 3, spread: -10, total: 41.5, homeMoneyline: -410, awayMoneyline: 330,
        props: [
          { playerName: "Lamar Jackson",     statType: "PASSING_YARDS",  line: 255.5, result: 218, odds: -115 },
          { playerName: "Derrick Henry",     statType: "RUSHING_YARDS",  line: 82.5,  result: 64,  odds: -120 },
          { playerName: "Mark Andrews",      statType: "RECEIVING_YARDS",line: 52.5,  result: 41,  odds: -110 },
        ],
      },
      { homeTeam: "MIA", awayTeam: "NYJ", homeScore: 34, awayScore: 15, gameDayOffset: 4, spread: -7, total: 47.5, homeMoneyline: -275, awayMoneyline: 228,
        props: [
          { playerName: "Tua Tagovailoa",    statType: "PASSING_YARDS",  line: 268.5, result: 301, odds: -115 },
          { playerName: "Tyreek Hill",        statType: "RECEIVING_YARDS",line: 92.5,  result: 118, odds: -115 },
          { playerName: "Jaylen Waddle",     statType: "RECEIVING_YARDS",line: 62.5,  result: 74,  odds: -110 },
          { playerName: "De'Von Achane",     statType: "RUSHING_YARDS",  line: 68.5,  result: 89,  odds: -115 },
        ],
      },
    ],
  },
  {
    number: 13, startDate: "2024-11-28", endDate: "2024-12-02",
    games: [
      { homeTeam: "KC", awayTeam: "LV", homeScore: 19, awayScore: 17, gameDayOffset: 0, spread: -11.5, total: 43.5, homeMoneyline: -480, awayMoneyline: 375,
        props: [
          { playerName: "Patrick Mahomes",  statType: "PASSING_YARDS",  line: 268.5, result: 252, odds: -115 },
          { playerName: "Travis Kelce",      statType: "RECEIVING_YARDS",line: 70.5,  result: 58,  odds: -115 },
          { playerName: "Davante Adams",     statType: "RECEIVING_YARDS",line: 78.5,  result: 94,  odds: -115 },
        ],
      },
      { homeTeam: "DAL", awayTeam: "NYG", homeScore: 27, awayScore: 20, gameDayOffset: 0, spread: -8, total: 43.5, homeMoneyline: -320, awayMoneyline: 262,
        props: [
          { playerName: "Dak Prescott",      statType: "PASSING_YARDS",  line: 258.5, result: 278, odds: -110 },
          { playerName: "CeeDee Lamb",        statType: "RECEIVING_YARDS",line: 88.5,  result: 104, odds: -115 },
          { playerName: "Malik Nabers",      statType: "RECEIVING_YARDS",line: 72.5,  result: 61,  odds: -115 },
        ],
      },
      { homeTeam: "SF", awayTeam: "LAR", homeScore: 17, awayScore: 9, gameDayOffset: 3, spread: -7.5, total: 41.5, homeMoneyline: -308, awayMoneyline: 252,
        props: [
          { playerName: "Brock Purdy",        statType: "PASSING_YARDS",  line: 238.5, result: 221, odds: -115 },
          { playerName: "Christian McCaffrey",statType: "RUSHING_YARDS",  line: 86.5,  result: 101, odds: -120 },
          { playerName: "Deebo Samuel",       statType: "RECEIVING_YARDS",line: 58.5,  result: 47,  odds: -110 },
          { playerName: "Puka Nacua",         statType: "RECEIVING_YARDS",line: 68.5,  result: 54,  odds: -115 },
        ],
      },
    ],
  },
  {
    number: 14, startDate: "2024-12-05", endDate: "2024-12-09",
    games: [
      { homeTeam: "BUF", awayTeam: "MIA", homeScore: 32, awayScore: 29, gameDayOffset: 0, spread: -5, total: 54.5, homeMoneyline: -212, awayMoneyline: 178,
        props: [
          { playerName: "Josh Allen",         statType: "PASSING_YARDS",  line: 278.5, result: 318, odds: -115 },
          { playerName: "James Cook",         statType: "RUSHING_YARDS",  line: 65.5,  result: 72,  odds: -110 },
          { playerName: "Tua Tagovailoa",    statType: "PASSING_YARDS",  line: 265.5, result: 297, odds: -115 },
          { playerName: "Tyreek Hill",        statType: "RECEIVING_YARDS",line: 90.5,  result: 108, odds: -115 },
        ],
      },
      { homeTeam: "DET", awayTeam: "GB", homeScore: 34, awayScore: 31, gameDayOffset: 3, spread: -4.5, total: 56.5, homeMoneyline: -200, awayMoneyline: 168,
        props: [
          { playerName: "Jared Goff",         statType: "PASSING_YARDS",  line: 268.5, result: 301, odds: -110 },
          { playerName: "Amon-Ra St. Brown",  statType: "RECEIVING_YARDS",line: 82.5,  result: 97,  odds: -115 },
          { playerName: "Sam LaPorta",        statType: "RECEIVING_YARDS",line: 48.5,  result: 72,  odds: -110 },
          { playerName: "Jordan Love",        statType: "PASSING_YARDS",  line: 255.5, result: 271, odds: -110 },
        ],
      },
      { homeTeam: "KC", awayTeam: "CIN", homeScore: 24, awayScore: 17, gameDayOffset: 4, spread: -6.5, total: 47.5, homeMoneyline: -252, awayMoneyline: 210,
        props: [
          { playerName: "Patrick Mahomes",  statType: "PASSING_YARDS",  line: 272.5, result: 254, odds: -115 },
          { playerName: "Travis Kelce",      statType: "RECEIVING_YARDS",line: 68.5,  result: 81,  odds: -115 },
          { playerName: "Joe Burrow",         statType: "PASSING_YARDS",  line: 262.5, result: 241, odds: -110 },
          { playerName: "Ja'Marr Chase",     statType: "RECEIVING_YARDS",line: 85.5,  result: 79,  odds: -115 },
        ],
      },
    ],
  },
  {
    number: 15, startDate: "2024-12-12", endDate: "2024-12-16",
    games: [
      { homeTeam: "BAL", awayTeam: "KC", homeScore: 23, awayScore: 20, gameDayOffset: 0, spread: -2.5, total: 48.5, homeMoneyline: -145, awayMoneyline: 125,
        props: [
          { playerName: "Lamar Jackson",     statType: "PASSING_YARDS",  line: 248.5, result: 261, odds: -115 },
          { playerName: "Derrick Henry",     statType: "RUSHING_YARDS",  line: 88.5,  result: 104, odds: -120 },
          { playerName: "Patrick Mahomes",  statType: "PASSING_YARDS",  line: 268.5, result: 252, odds: -115 },
          { playerName: "Travis Kelce",      statType: "RECEIVING_YARDS",line: 68.5,  result: 61,  odds: -115 },
        ],
      },
      { homeTeam: "PHI", awayTeam: "DAL", homeScore: 41, awayScore: 7, gameDayOffset: 3, spread: -7, total: 46.5, homeMoneyline: -278, awayMoneyline: 232,
        props: [
          { playerName: "Jalen Hurts",       statType: "PASSING_YARDS",  line: 222.5, result: 261, odds: -110 },
          { playerName: "Saquon Barkley",    statType: "RUSHING_YARDS",  line: 88.5,  result: 147, odds: -115 },
          { playerName: "Dallas Goedert",    statType: "RECEIVING_YARDS",line: 58.5,  result: 82,  odds: -110 },
          { playerName: "Dak Prescott",      statType: "PASSING_YARDS",  line: 248.5, result: 163, odds: -110 },
        ],
      },
      { homeTeam: "MIN", awayTeam: "CHI", homeScore: 30, awayScore: 12, gameDayOffset: 4, spread: -10, total: 44.5, homeMoneyline: -415, awayMoneyline: 335,
        props: [
          { playerName: "Sam Darnold",        statType: "PASSING_YARDS",  line: 235.5, result: 251, odds: -110 },
          { playerName: "Justin Jefferson",  statType: "RECEIVING_YARDS",line: 88.5,  result: 112, odds: -115 },
          { playerName: "Aaron Jones",        statType: "RUSHING_YARDS",  line: 58.5,  result: 71,  odds: -110 },
          { playerName: "DJ Moore",           statType: "RECEIVING_YARDS",line: 65.5,  result: 48,  odds: -115 },
        ],
      },
    ],
  },
  {
    number: 16, startDate: "2024-12-19", endDate: "2024-12-23",
    games: [
      { homeTeam: "BUF", awayTeam: "NYJ", homeScore: 40, awayScore: 14, gameDayOffset: 0, spread: -14.5, total: 46.5, homeMoneyline: -620, awayMoneyline: 470,
        props: [
          { playerName: "Josh Allen",         statType: "PASSING_YARDS",  line: 268.5, result: 312, odds: -115 },
          { playerName: "Josh Allen",         statType: "RUSHING_YARDS",  line: 45.5,  result: 62,  odds: -115 },
          { playerName: "James Cook",         statType: "RUSHING_YARDS",  line: 68.5,  result: 94,  odds: -110 },
        ],
      },
      { homeTeam: "SF", awayTeam: "LAR", homeScore: 12, awayScore: 6, gameDayOffset: 3, spread: -7.5, total: 38.5, homeMoneyline: -305, awayMoneyline: 248,
        props: [
          { playerName: "Brock Purdy",        statType: "PASSING_YARDS",  line: 235.5, result: 218, odds: -115 },
          { playerName: "Christian McCaffrey",statType: "RUSHING_YARDS",  line: 85.5,  result: 71,  odds: -120 },
          { playerName: "Matthew Stafford",  statType: "PASSING_YARDS",  line: 228.5, result: 201, odds: -110 },
          { playerName: "Puka Nacua",         statType: "RECEIVING_YARDS",line: 65.5,  result: 54,  odds: -115 },
        ],
      },
      { homeTeam: "MIN", awayTeam: "GB", homeScore: 27, awayScore: 25, gameDayOffset: 4, spread: -4, total: 50.5, homeMoneyline: -190, awayMoneyline: 160,
        props: [
          { playerName: "Sam Darnold",        statType: "PASSING_YARDS",  line: 238.5, result: 267, odds: -110 },
          { playerName: "Justin Jefferson",  statType: "RECEIVING_YARDS",line: 90.5,  result: 104, odds: -115 },
          { playerName: "Jordan Love",        statType: "PASSING_YARDS",  line: 252.5, result: 261, odds: -110 },
          { playerName: "Josh Jacobs",        statType: "RUSHING_YARDS",  line: 70.5,  result: 65,  odds: -110 },
        ],
      },
    ],
  },
  {
    number: 17, startDate: "2024-12-26", endDate: "2024-12-30",
    games: [
      { homeTeam: "KC", awayTeam: "CIN", homeScore: 34, awayScore: 23, gameDayOffset: 0, spread: -8.5, total: 49.5, homeMoneyline: -345, awayMoneyline: 280,
        props: [
          { playerName: "Patrick Mahomes",  statType: "PASSING_YARDS",  line: 275.5, result: 298, odds: -115 },
          { playerName: "Travis Kelce",      statType: "RECEIVING_YARDS",line: 72.5,  result: 94,  odds: -115 },
          { playerName: "Joe Burrow",         statType: "PASSING_YARDS",  line: 268.5, result: 274, odds: -110 },
          { playerName: "Ja'Marr Chase",     statType: "RECEIVING_YARDS",line: 88.5,  result: 112, odds: -115 },
        ],
      },
      { homeTeam: "PHI", awayTeam: "DAL", homeScore: 37, awayScore: 27, gameDayOffset: 3, spread: -9.5, total: 52.5, homeMoneyline: -388, awayMoneyline: 312,
        props: [
          { playerName: "Jalen Hurts",       statType: "PASSING_YARDS",  line: 228.5, result: 254, odds: -110 },
          { playerName: "Saquon Barkley",    statType: "RUSHING_YARDS",  line: 92.5,  result: 118, odds: -115 },
          { playerName: "Dak Prescott",      statType: "PASSING_YARDS",  line: 252.5, result: 271, odds: -110 },
          { playerName: "CeeDee Lamb",        statType: "RECEIVING_YARDS",line: 90.5,  result: 103, odds: -115 },
        ],
      },
      { homeTeam: "BAL", awayTeam: "BUF", homeScore: 35, awayScore: 10, gameDayOffset: 4, spread: -4.5, total: 49.5, homeMoneyline: -200, awayMoneyline: 168,
        props: [
          { playerName: "Lamar Jackson",     statType: "PASSING_YARDS",  line: 252.5, result: 291, odds: -115 },
          { playerName: "Lamar Jackson",     statType: "RUSHING_YARDS",  line: 52.5,  result: 78,  odds: -120 },
          { playerName: "Derrick Henry",     statType: "RUSHING_YARDS",  line: 90.5,  result: 127, odds: -120 },
          { playerName: "Josh Allen",         statType: "PASSING_YARDS",  line: 272.5, result: 201, odds: -115 },
        ],
      },
    ],
  },
  {
    number: 18, startDate: "2025-01-02", endDate: "2025-01-06",
    games: [
      { homeTeam: "SF", awayTeam: "LAR", homeScore: 27, awayScore: 24, gameDayOffset: 3, spread: -5.5, total: 48.5, homeMoneyline: -218, awayMoneyline: 182,
        props: [
          { playerName: "Brock Purdy",        statType: "PASSING_YARDS",  line: 242.5, result: 267, odds: -115 },
          { playerName: "Christian McCaffrey",statType: "RUSHING_YARDS",  line: 88.5,  result: 104, odds: -120 },
          { playerName: "Matthew Stafford",  statType: "PASSING_YARDS",  line: 232.5, result: 248, odds: -110 },
          { playerName: "Puka Nacua",         statType: "RECEIVING_YARDS",line: 70.5,  result: 79,  odds: -115 },
        ],
      },
      { homeTeam: "DET", awayTeam: "MIN", homeScore: 31, awayScore: 9, gameDayOffset: 3, spread: -6.5, total: 47.5, homeMoneyline: -252, awayMoneyline: 210,
        props: [
          { playerName: "Jared Goff",         statType: "PASSING_YARDS",  line: 265.5, result: 284, odds: -110 },
          { playerName: "Amon-Ra St. Brown",  statType: "RECEIVING_YARDS",line: 80.5,  result: 98,  odds: -115 },
          { playerName: "Sam LaPorta",        statType: "RECEIVING_YARDS",line: 50.5,  result: 67,  odds: -110 },
          { playerName: "Justin Jefferson",  statType: "RECEIVING_YARDS",line: 88.5,  result: 64,  odds: -115 },
        ],
      },
      { homeTeam: "KC", awayTeam: "DEN", homeScore: 24, awayScore: 9, gameDayOffset: 3, spread: -13.5, total: 42.5, homeMoneyline: -580, awayMoneyline: 440,
        props: [
          { playerName: "Patrick Mahomes",  statType: "PASSING_YARDS",  line: 268.5, result: 281, odds: -115 },
          { playerName: "Travis Kelce",      statType: "RECEIVING_YARDS",line: 70.5,  result: 83,  odds: -115 },
          { playerName: "Travis Kelce",      statType: "RECEPTIONS",     line: 5.5,   result: 7,   odds: -120 },
        ],
      },
    ],
  },
];

// ─── Seed ────────────────────────────────────────────────────────────────────
async function main() {
  const existingCount = await prisma.week.count();
  if (existingCount >= 18) {
    console.log(`Already have ${existingCount} weeks — skipping seed`);
    return;
  }

  console.log("Seeding players...");
  const playerMap = new Map<string, string>(); // name → id
  for (const p of PLAYERS) {
    let player = await prisma.player.findFirst({ where: { name: p.name } });
    if (!player) {
      player = await prisma.player.create({ data: p });
    }
    playerMap.set(p.name, player.id);
  }
  console.log(`  ${playerMap.size} players ready`);

  let totalGames = 0, totalLines = 0, totalProps = 0;

  for (const weekData of NFL_SEASON) {
    const existing = await prisma.week.findFirst({ where: { number: weekData.number } });
    if (existing) { console.log(`  Week ${weekData.number} already exists — skipping`); continue; }

    const startDate = new Date(weekData.startDate);
    const endDate   = new Date(weekData.endDate);

    const week = await prisma.week.create({
      data: { number: weekData.number, startDate, endDate },
    });

    for (const gameData of weekData.games) {
      const gameDate = new Date(startDate);
      gameDate.setDate(gameDate.getDate() + gameData.gameDayOffset);
      gameDate.setHours(20, 25, 0, 0); // ~8:25 PM ET

      const game = await prisma.game.create({
        data: {
          weekId: week.id,
          homeTeam: gameData.homeTeam,
          awayTeam: gameData.awayTeam,
          gameDate,
          homeScore: gameData.homeScore,
          awayScore: gameData.awayScore,
        },
      });

      // Compute game line results from stored scores
      const { homeScore: hs, awayScore: as_, spread, total, homeMoneyline, awayMoneyline } = gameData;

      const lines = [
        { market: "MONEYLINE_HOME", label: `${gameData.homeTeam} ML`,          odds: homeMoneyline,  line: null as number | null, result: hs > as_ },
        { market: "MONEYLINE_AWAY", label: `${gameData.awayTeam} ML`,          odds: awayMoneyline,  line: null as number | null, result: as_ > hs },
        { market: "SPREAD_HOME",    label: `${gameData.homeTeam} ${spread > 0 ? "+" : ""}${spread}`, odds: -110, line: spread as number | null,  result: hs + spread > as_ },
        { market: "SPREAD_AWAY",    label: `${gameData.awayTeam} ${spread > 0 ? "-" : "+"}${Math.abs(spread)}`, odds: -110, line: -spread as number | null, result: as_ + (-spread) > hs },
        { market: "TOTAL_OVER",     label: `Over ${total}`,                    odds: -110,           line: total as number | null, result: hs + as_ > total },
        { market: "TOTAL_UNDER",    label: `Under ${total}`,                   odds: -110,           line: total as number | null, result: hs + as_ < total },
      ];

      for (const l of lines) {
        await prisma.gameLine.create({
          data: { gameId: game.id, market: l.market, label: l.label, odds: l.odds, line: l.line, result: l.result },
        });
      }
      totalLines += lines.length;

      // Create props
      for (const propData of gameData.props) {
        const playerId = playerMap.get(propData.playerName);
        if (!playerId) { console.warn(`  Player not found: ${propData.playerName}`); continue; }

        // Skip duplicate (same player + statType in same game — edge case with Lamar/Allen having two props)
        const dup = await prisma.prop.findFirst({ where: { gameId: game.id, playerId, statType: propData.statType } });
        if (dup) continue;

        await prisma.prop.create({
          data: {
            gameId: game.id,
            playerId,
            statType: propData.statType,
            line: propData.line,
            odds: propData.odds ?? -110,
            result: propData.result,
          },
        });
        totalProps++;
      }
      totalGames++;
    }

    console.log(`  Week ${weekData.number} seeded`);
  }

  console.log(`\nDone — ${NFL_SEASON.length} weeks, ${totalGames} games, ${totalLines} game lines, ${totalProps} props`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
