// API response shapes. Dates arrive as ISO strings; money is integer cents.

export type Outcome = "PENDING" | "WIN" | "LOSS" | "PUSH" | "VOID";
export type Direction = "OVER" | "UNDER";
export type GameStatus = "SCHEDULED" | "LIVE" | "FINAL" | "CANCELLED";

export interface Player {
  id: string;
  name: string;
  team: string;
  position: string;
  espnId: string | null;
  imageUrl: string | null;
  jersey: string | null;
}

export interface AltRung { line: number; over: number; under: number }

export interface Prop {
  id: string;
  gameId: string;
  playerId: string;
  statType: string;
  line: number;
  odds: number;
  result: number | null;
  available: boolean;
  altLadder: AltRung[] | null;
  player?: Player;
}

export interface GameLine {
  id: string;
  gameId: string;
  market: string;
  label: string;
  odds: number;
  line: number | null;
  result: boolean | null;
  pushed: boolean;
  available: boolean;
}

export interface Game {
  id: string;
  weekId: string;
  homeTeam: string;
  awayTeam: string;
  gameDate: string;
  status: GameStatus | string;
  homeScore: number | null;
  awayScore: number | null;
  indoor: boolean | null;
  weather: string | null;
  weatherTemp: number | null;
  homeRecord: string | null;
  awayRecord: string | null;
  betCount?: number;
  week?: { number: number };
  props?: Prop[];
  gameLines?: GameLine[];
}

export interface Week {
  id: string;
  number: number;
  startDate: string;
  endDate: string;
  resolved: boolean;
  locked: boolean;
  games?: Game[];
}

export interface League {
  id: string;
  name: string;
  weeklyAllowance: number;
  inviteCode: string;
  creatorId: string;
  seasonStarted: boolean;
  seasonEnded: boolean;
  championId: string | null;
  isPublic: boolean;
  maxPlayers: number;
  startWeek: number;
  regularSeasonWeeks: number;
  playoffWeeks: number;
  playoffSize: number;
  autoStartAt: string | null;
  maxPublicPlayers: number;
  maxStakePerBet: number | null;
  maxBetsPerWeek: number | null;
  maxParlayLegs: number | null;
  feedVisibility: "AFTER_KICKOFF" | "AFTER_RESOLVE";
}

// One row of GET /leagues/:id/leaderboard.
export interface Standing {
  rank: number;
  prevRank?: number;
  userId: string;
  displayName: string;
  abbreviation: string;
  helmetColor: string;
  joinedAt: string;
  wins: number;
  losses: number;
  ties: number;
  balance: number;
}

export interface MatchupUser {
  id: string;
  displayName: string;
  abbreviation: string | null;
  helmetColor: string | null;
  balance: number | null;
}

export interface Matchup {
  id: string;
  leagueId: string;
  weekNumber: number;
  homeUserId: string;
  awayUserId: string;
  homeProfit: number | null;
  awayProfit: number | null;
  winnerId: string | null;
  isTie: boolean;
  isBye: boolean;
  isPlayoff: boolean;
  isConsolation: boolean;
  isGhostMatchup: boolean;
  playoffRound: number | null;
  homeUser?: MatchupUser | null;
  awayUser?: MatchupUser | null;
}

export interface ChatMessage {
  id: string;
  body: string;
  createdAt: string;
  user?: { id: string; displayName: string };
}

interface BetBase {
  id: string;
  stake: number;
  odds: number;
  outcome: Outcome;
  cashedOut: boolean;
  createdAt: string;
  voidReason: string | null;
}

export interface Pick extends BetBase {
  propId: string;
  direction: Direction;
  altLine: number | null;
  prop?: Prop & { game?: Game };
}

export interface GamePick extends BetBase {
  gameLineId: string;
  altLine: number | null;
  gameLine?: GameLine & { game?: Game };
}

export interface ParlayLeg {
  id: string;
  propId: string | null;
  gameLineId: string | null;
  direction: Direction | null;
  odds: number;
  altLine: number | null;
  outcome: Outcome;
  prop?: Prop & { game?: Game };
  gameLine?: GameLine & { game?: Game };
}

export interface Parlay extends Omit<BetBase, "odds"> {
  totalOdds: number;
  payout: number;
  legs?: ParlayLeg[];
}

// One row of GET /leagues/:id/pending.
export interface PendingMember {
  userId: string;
  helmetColor?: string;
  displayName?: string;
  user?: { id: string; displayName: string };
}

// One row of GET /memberships: the caller's own leagues.
export interface MyMembership {
  leagueId: string;
  displayName: string;
  helmetColor: string;
  league?: League;
}

// GET /users/me
export interface Me {
  id: string;
  email: string;
  displayName: string;
  firstName: string | null;
  lastName: string | null;
  timeZone: string | null;
  defaultAbbreviation: string | null;
  defaultHelmetColor: string | null;
  helmetPalette: string[];
  hasGoogle: boolean;
  yearsExperience: number;
  nextSeasonYear: number;
  createdAt: string;
}
