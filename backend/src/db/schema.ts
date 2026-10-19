import {
  pgTable, pgEnum, text, integer, boolean, timestamp, real, jsonb, index, uniqueIndex,
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";
import { randomUUID } from "crypto";

//  Enums

export const statTypeEnum = pgEnum("StatType", [
  "PASSING_YARDS", "PASSING_TOUCHDOWNS", "PASSING_COMPLETIONS",
  "PASSING_ATTEMPTS", "PASSING_INTERCEPTIONS", "PASSING_LONGEST",
  "RUSHING_YARDS", "RUSHING_TOUCHDOWNS", "RUSHING_ATTEMPTS", "RUSHING_LONGEST",
  "RECEIVING_YARDS", "RECEIVING_TOUCHDOWNS", "RECEIVING_LONGEST",
  "RECEIVING_TARGETS", "RECEPTIONS",
  "SACKS", "TACKLES_ASSISTS", "DEFENSIVE_INTERCEPTIONS",
  "FIELD_GOALS_MADE", "FIELD_GOAL_LONGEST", "KICKING_POINTS",
  "EXTRA_POINTS_MADE", "TOUCHDOWNS",
]);

export const directionEnum = pgEnum("Direction", ["OVER", "UNDER"]);
export const membershipStatusEnum = pgEnum("MembershipStatus", ["PENDING", "ACTIVE"]);
// PUSH: landed exactly on the line, stake back. VOID: cashed out or never played.
export const outcomeEnum = pgEnum("Outcome", ["PENDING", "WIN", "LOSS", "VOID", "PUSH"]);

//  Tables

export const users = pgTable("User", {
  id:          text("id").primaryKey().$defaultFn(() => randomUUID()),
  email:       text("email").notNull().unique(),
  password:    text("password"),
  googleId:    text("googleId").unique(),
  name:        text("name").notNull(),
  displayName: text("displayName").notNull(),
  firstName:   text("firstName"),
  lastName:    text("lastName"),
  // IANA zone from the browser, re-synced when it changes.
  timeZone:    text("timeZone"),
  // Seeds per-league identity on join; null means generate one.
  defaultAbbreviation: text("defaultAbbreviation"),
  defaultHelmetColor:  text("defaultHelmetColor"),
  deactivatedAt: timestamp("deactivatedAt"),
  // When the user accepted the 18+ terms. Null for accounts predating it.
  ageConfirmedAt: timestamp("ageConfirmedAt"),
  createdAt:   timestamp("createdAt").defaultNow().notNull(),
});

export const leagues = pgTable("League", {
  id:                 text("id").primaryKey().$defaultFn(() => randomUUID()),
  name:               text("name").notNull(),
  weeklyAllowance:    integer("weeklyAllowance").notNull(),
  inviteCode:         text("inviteCode").notNull().unique(),
  creatorId:          text("creatorId").notNull(),
  seasonStarted:      boolean("seasonStarted").default(false).notNull(),
  seasonEnded:        boolean("seasonEnded").default(false).notNull(),
  championId:         text("championId"),
  isPublic:           boolean("isPublic").default(false).notNull(),
  maxPlayers:         integer("maxPlayers").default(10).notNull(),
  startWeek:          integer("startWeek").default(1).notNull(),
  regularSeasonWeeks: integer("regularSeasonWeeks").default(13).notNull(),
  playoffWeeks:       integer("playoffWeeks").default(3).notNull(),
  playoffSize:        integer("playoffSize").default(4).notNull(),
  consolationTeams:   integer("consolationTeams").default(6).notNull(),
  consolationWeeks:   integer("consolationWeeks").default(2).notNull(),
  hasGhost:           boolean("hasGhost").default(false).notNull(),
  autoStartAt:        timestamp("autoStartAt"),
  maxPublicPlayers:   integer("maxPublicPlayers").default(0).notNull(),
  maxStakePerBet:     integer("maxStakePerBet"),
  maxBetsPerWeek:     integer("maxBetsPerWeek"),
  maxParlayLegs:      integer("maxParlayLegs").default(10),
  feedVisibility:     text("feedVisibility").default("AFTER_KICKOFF").notNull(),
  skillLevel:         text("skillLevel").default("BEGINNER").notNull(),
  // Counts of ACTIVE members, maintained only by services/leagueSeats.
  activeMemberCount:     integer("activeMemberCount").default(0).notNull(),
  activePublicFillCount: integer("activePublicFillCount").default(0).notNull(),
  createdAt:          timestamp("createdAt").defaultNow().notNull(),
}, (t) => ({
  // Partial index on open leagues, which stay a small set.
  matchIdx: index("League_match_idx")
    .on(t.skillLevel, t.startWeek, t.maxPlayers, t.isPublic)
    .where(sql`"seasonStarted" = false`),
}));

export const matchups = pgTable("Matchup", {
  id:             text("id").primaryKey().$defaultFn(() => randomUUID()),
  leagueId:       text("leagueId").notNull(),
  weekNumber:     integer("weekNumber").notNull(),
  homeUserId:     text("homeUserId").notNull(),
  awayUserId:     text("awayUserId").notNull(),
  homeProfit:     integer("homeProfit"),
  awayProfit:     integer("awayProfit"),
  winnerId:       text("winnerId"),
  isTie:          boolean("isTie").default(false).notNull(),
  isBye:          boolean("isBye").default(false).notNull(),
  isPlayoff:      boolean("isPlayoff").default(false).notNull(),
  isConsolation:  boolean("isConsolation").default(false).notNull(),
  isGhostMatchup: boolean("isGhostMatchup").default(false).notNull(),
  playoffRound:   integer("playoffRound"),
  createdAt:      timestamp("createdAt").defaultNow().notNull(),
}, (t) => ({
  leagueWeekIdx: index("Matchup_leagueId_weekNumber_idx").on(t.leagueId, t.weekNumber),
}));

export const memberships = pgTable("Membership", {
  id:             text("id").primaryKey().$defaultFn(() => randomUUID()),
  userId:         text("userId").notNull(),
  leagueId:       text("leagueId").notNull(),
  balance:        integer("balance").notNull(),
  status:         membershipStatusEnum("status").default("ACTIVE").notNull(),
  isPublicFill:   boolean("isPublicFill").default(false).notNull(),
  helmetColor:    text("helmetColor").default("#2563EB").notNull(),
  displayName:    text("displayName").default("").notNull(),
  abbreviation:   text("abbreviation").default("").notNull(),
  createdAt:      timestamp("createdAt").defaultNow().notNull(),
}, (t) => ({
  userLeagueUniq: uniqueIndex("Membership_userId_leagueId_key").on(t.userId, t.leagueId),
  userIdx:   index("Membership_userId_idx").on(t.userId),
  leagueIdx: index("Membership_leagueId_idx").on(t.leagueId),
}));

export const weeks = pgTable("Week", {
  id:                   text("id").primaryKey().$defaultFn(() => randomUUID()),
  number:               integer("number").notNull().unique(),
  startDate:            timestamp("startDate").notNull(),
  endDate:              timestamp("endDate").notNull(),
  resolved:             boolean("resolved").default(false).notNull(),
  locked:               boolean("locked").default(false).notNull(),
  allowanceDistributed: boolean("allowanceDistributed").default(false).notNull(),
  // Landing page sample, computed once per week so it stays stable.
  publicBoard:          jsonb("publicBoard").$type<{
                          markets: unknown[];
                          totals: { lines: number; props: number };
                        }>(),
  createdAt:            timestamp("createdAt").defaultNow().notNull(),
});

export const games = pgTable("Game", {
  id:           text("id").primaryKey().$defaultFn(() => randomUUID()),
  weekId:       text("weekId").notNull(),
  homeTeam:     text("homeTeam").notNull(),
  awayTeam:     text("awayTeam").notNull(),
  gameDate:     timestamp("gameDate").notNull(),
  status:       text("status").default("SCHEDULED").notNull(),
  // SportsGameOdds eventID. (Previously held a SharpAPI event id; SharpAPI is gone.)
  externalId:   text("externalId").unique(),
  espnId:       text("espnId").unique(),
  // Drives the tiered odds poller.
  oddsPolledAt: timestamp("oddsPolledAt"),
  // Set once the post-game settlement fetch has graded this game's markets.
  oddsSettledAt: timestamp("oddsSettledAt"),
  homeScore:    integer("homeScore"),
  awayScore:    integer("awayScore"),
  statusDetail: text("statusDetail").default("").notNull(),
  // Weather fields are null until ESPN has a forecast (~10 days out).
  indoor:       boolean("indoor"),
  weather:      text("weather"),
  weatherTemp:  integer("weatherTemp"),
  homeRecord:   text("homeRecord"),
  awayRecord:   text("awayRecord"),
}, (t) => ({
  // Every week-scoped read (the board, bet counts, settlement's sweep) filters here.
  weekIdx: index("Game_weekId_idx").on(t.weekId),
}));

export const players = pgTable("Player", {
  id:       text("id").primaryKey().$defaultFn(() => randomUUID()),
  name:     text("name").notNull(),
  team:     text("team").notNull(),
  position: text("position").notNull(),
  espnId:   text("espnId").unique(),
  sgoId:    text("sgoId").unique(),
  imageUrl: text("imageUrl"),
  jersey:   text("jersey"),
}, (t) => ({
  nameTeamUniq: uniqueIndex("Player_name_team_key").on(t.name, t.team),
}));

export const props = pgTable("Prop", {
  id:       text("id").primaryKey().$defaultFn(() => randomUUID()),
  gameId:   text("gameId").notNull(),
  playerId: text("playerId").notNull(),
  statType: statTypeEnum("statType").notNull(),
  line:     real("line").notNull(),
  odds:     integer("odds").default(-110).notNull(),
  result:   real("result"),
  source:   text("source").default("FAKE").notNull(),
  available: boolean("available").default(true).notNull(),
  // SGO oddID; settlement reads the graded value by this.
  oddID:    text("oddID"),
  // Book's alt-line ladder; null falls back to linear pricing (services/propOdds).
  altLadder: jsonb("altLadder").$type<Array<{ line: number; over: number; under: number }>>(),
}, (t) => ({
  gamePlayerStatUniq: uniqueIndex("Prop_gameId_playerId_statType_key").on(t.gameId, t.playerId, t.statType),
}));

export const picks = pgTable("Pick", {
  id:        text("id").primaryKey().$defaultFn(() => randomUUID()),
  userId:    text("userId").notNull(),
  leagueId:  text("leagueId").notNull(),
  propId:    text("propId").notNull(),
  direction: directionEnum("direction").notNull(),
  stake:     integer("stake").notNull(),
  odds:      integer("odds").default(-110).notNull(),
  altLine:   real("altLine"),
  outcome:   outcomeEnum("outcome").default("PENDING").notNull(),
  cashedOut: boolean("cashedOut").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  voidReason: text("voidReason"),
}, (t) => ({
  memberIdx: index("Pick_userId_leagueId_idx").on(t.userId, t.leagueId),
  propIdx:   index("Pick_propId_idx").on(t.propId),
}));

export const gameLines = pgTable("GameLine", {
  id:      text("id").primaryKey().$defaultFn(() => randomUUID()),
  gameId:  text("gameId").notNull(),
  market:  text("market").notNull(),
  label:   text("label").notNull(),
  odds:    integer("odds").notNull(),
  line:    real("line"),
  result:  boolean("result"),
  // Result landed exactly on the line.
  pushed:  boolean("pushed").default(false).notNull(),
  available: boolean("available").default(true).notNull(),
  oddID:   text("oddID"),
}, (t) => ({
  gameIdMarketUniq: uniqueIndex("GameLine_gameId_market_key").on(t.gameId, t.market),
}));

export const gamePicks = pgTable("GamePick", {
  id:         text("id").primaryKey().$defaultFn(() => randomUUID()),
  userId:     text("userId").notNull(),
  leagueId:   text("leagueId").notNull(),
  gameLineId: text("gameLineId").notNull(),
  stake:      integer("stake").notNull(),
  odds:       integer("odds").notNull(),
  altLine:    real("altLine"),
  outcome:    outcomeEnum("outcome").default("PENDING").notNull(),
  cashedOut:  boolean("cashedOut").default(false).notNull(),
  createdAt:  timestamp("createdAt").defaultNow().notNull(),
  voidReason: text("voidReason"),
}, (t) => ({
  memberIdx:   index("GamePick_userId_leagueId_idx").on(t.userId, t.leagueId),
  gameLineIdx: index("GamePick_gameLineId_idx").on(t.gameLineId),
}));

export const parlays = pgTable("Parlay", {
  id:        text("id").primaryKey().$defaultFn(() => randomUUID()),
  userId:    text("userId").notNull(),
  leagueId:  text("leagueId").notNull(),
  stake:     integer("stake").notNull(),
  totalOdds: integer("totalOdds").notNull(),
  payout:    integer("payout").notNull(),
  outcome:   outcomeEnum("outcome").default("PENDING").notNull(),
  cashedOut: boolean("cashedOut").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  voidReason: text("voidReason"),
}, (t) => ({
  memberIdx: index("Parlay_userId_leagueId_idx").on(t.userId, t.leagueId),
}));

export const parlayLegs = pgTable("ParlayLeg", {
  id:         text("id").primaryKey().$defaultFn(() => randomUUID()),
  parlayId:   text("parlayId").notNull(),
  propId:     text("propId"),
  gameLineId: text("gameLineId"),
  direction:  directionEnum("direction"),
  odds:       integer("odds").notNull(),
  altLine:    real("altLine"),
  outcome:    outcomeEnum("outcome").default("PENDING").notNull(),
}, (t) => ({
  parlayIdx:   index("ParlayLeg_parlayId_idx").on(t.parlayId),
  propIdx:     index("ParlayLeg_propId_idx").on(t.propId),
  gameLineIdx: index("ParlayLeg_gameLineId_idx").on(t.gameLineId),
}));

export const leagueMessages = pgTable("LeagueMessage", {
  id:        text("id").primaryKey().$defaultFn(() => randomUUID()),
  leagueId:  text("leagueId").notNull(),
  userId:    text("userId").notNull(),
  body:      text("body").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (t) => ({
  // Chat reads one league's newest messages, every 5s while the drawer is open.
  leagueCreatedIdx: index("LeagueMessage_leagueId_createdAt_idx").on(t.leagueId, t.createdAt),
}));

//  Relations

export const usersRelations = relations(users, ({ many }) => ({
  memberships:        many(memberships),
  picks:              many(picks),
  gamePicks:          many(gamePicks),
  parlays:            many(parlays),
  leagues:            many(leagues),
  homeMatchups:       many(matchups, { relationName: "homeMatchups" }),
  awayMatchups:       many(matchups, { relationName: "awayMatchups" }),
  messages:           many(leagueMessages),
}));

export const leaguesRelations = relations(leagues, ({ one, many }) => ({
  creator:     one(users, { fields: [leagues.creatorId], references: [users.id] }),
  memberships: many(memberships),
  picks:       many(picks),
  gamePicks:   many(gamePicks),
  parlays:     many(parlays),
  matchups:    many(matchups),
  messages:    many(leagueMessages),
}));

export const matchupsRelations = relations(matchups, ({ one }) => ({
  league:   one(leagues,  { fields: [matchups.leagueId],   references: [leagues.id] }),
  homeUser: one(users,    { fields: [matchups.homeUserId], references: [users.id], relationName: "homeMatchups" }),
  awayUser: one(users,    { fields: [matchups.awayUserId], references: [users.id], relationName: "awayMatchups" }),
}));

export const membershipsRelations = relations(memberships, ({ one }) => ({
  user:   one(users,   { fields: [memberships.userId],   references: [users.id] }),
  league: one(leagues, { fields: [memberships.leagueId], references: [leagues.id] }),
}));

export const weeksRelations = relations(weeks, ({ many }) => ({
  games: many(games),
}));

export const gamesRelations = relations(games, ({ one, many }) => ({
  week:      one(weeks, { fields: [games.weekId], references: [weeks.id] }),
  props:     many(props),
  gameLines: many(gameLines),
}));

export const playersRelations = relations(players, ({ many }) => ({
  props: many(props),
}));

export const propsRelations = relations(props, ({ one, many }) => ({
  game:       one(games,   { fields: [props.gameId],   references: [games.id] }),
  player:     one(players, { fields: [props.playerId], references: [players.id] }),
  picks:      many(picks),
  parlayLegs: many(parlayLegs),
}));

export const picksRelations = relations(picks, ({ one }) => ({
  user:   one(users,   { fields: [picks.userId],   references: [users.id] }),
  league: one(leagues, { fields: [picks.leagueId], references: [leagues.id] }),
  prop:   one(props,   { fields: [picks.propId],   references: [props.id] }),
}));

export const gameLinesRelations = relations(gameLines, ({ one, many }) => ({
  game:      one(games, { fields: [gameLines.gameId], references: [games.id] }),
  gamePicks: many(gamePicks),
  parlayLegs: many(parlayLegs),
}));

export const gamePicksRelations = relations(gamePicks, ({ one }) => ({
  user:     one(users,     { fields: [gamePicks.userId],     references: [users.id] }),
  league:   one(leagues,   { fields: [gamePicks.leagueId],   references: [leagues.id] }),
  gameLine: one(gameLines, { fields: [gamePicks.gameLineId], references: [gameLines.id] }),
}));

export const parlaysRelations = relations(parlays, ({ one, many }) => ({
  user:   one(users,   { fields: [parlays.userId],   references: [users.id] }),
  league: one(leagues, { fields: [parlays.leagueId], references: [leagues.id] }),
  legs:   many(parlayLegs),
}));

export const parlayLegsRelations = relations(parlayLegs, ({ one }) => ({
  parlay:   one(parlays,   { fields: [parlayLegs.parlayId],   references: [parlays.id] }),
  prop:     one(props,     { fields: [parlayLegs.propId],     references: [props.id] }),
  gameLine: one(gameLines, { fields: [parlayLegs.gameLineId], references: [gameLines.id] }),
}));

// Saved before sending; deliveredAt is null until the mail provider accepts it.
export const supportMessages = pgTable("SupportMessage", {
  id:          text("id").primaryKey().$defaultFn(() => randomUUID()),
  // Null for a signed-out sender - most of them, on the marketing routes.
  userId:      text("userId"),
  email:       text("email").notNull(),
  topic:       text("topic").default("contact").notNull(),
  body:        text("body").notNull(),
  createdAt:   timestamp("createdAt").defaultNow().notNull(),
  deliveredAt: timestamp("deliveredAt"),
});

export const leagueMessagesRelations = relations(leagueMessages, ({ one }) => ({
  league: one(leagues, { fields: [leagueMessages.leagueId], references: [leagues.id] }),
  user:   one(users,   { fields: [leagueMessages.userId],   references: [users.id] }),
}));
