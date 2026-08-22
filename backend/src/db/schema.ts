import {
  pgTable, pgEnum, text, integer, boolean, timestamp, date, real, jsonb, index, uniqueIndex,
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";
import { randomUUID } from "crypto";

// ─── Enums ───────────────────────────────────────────────────────────────────

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
// PUSH = result landed exactly on the line; stake refunded, no profit. VOID =
// cashed out or cancelled. They are distinct: a push is a graded bet that
// happened to tie, a void never resolved.
export const outcomeEnum = pgEnum("Outcome", ["PENDING", "WIN", "LOSS", "VOID", "PUSH"]);

// ─── Tables ──────────────────────────────────────────────────────────────────

export const users = pgTable("User", {
  id:          text("id").primaryKey().$defaultFn(() => randomUUID()),
  email:       text("email").notNull().unique(),
  password:    text("password"),
  googleId:    text("googleId").unique(),
  name:        text("name").notNull(),
  displayName: text("displayName").notNull(),
  // Collected during onboarding. Nullable because accounts created before this
  // existed have neither, and that absence is exactly what the onboarding gate
  // checks for — a user with no firstName has not been through it yet.
  firstName:   text("firstName"),
  lastName:    text("lastName"),
  // NOTE: there is deliberately no yearsExperience column. Experience is
  // *derived* from createdAt — see services/experience.ts. It was briefly a
  // self-reported integer, which meant the one number leagues gate on was a
  // free-text field anyone could type "20" into, so a rookie could walk into a
  // veterans-only league by lying. Tenure cannot be typed.
  // IANA zone name, e.g. "America/Detroit". Auto-detected from the browser and
  // refreshed whenever it changes, so it follows a user who travels. Not a
  // preference and not editable — it is a fact the device already knows.
  //
  // Replaced `country` and `region`. Those were kept when the league directory
  // was deleted, on the theory that location was still worth having; it turned
  // out the only thing the app ever wanted location FOR was time. Deriving time
  // from a country is strictly worse than asking the browser — the US spans six
  // zones — and the old Detect button did exactly that backwards: it read the
  // IANA zone, mapped it to a country, and threw the zone away.
  //
  // Nothing needs this to render a kickoff time; the client formats in the
  // viewer's own zone with no server input. It exists for the server-side case
  // — notifications sent at a sane local hour, where there is no browser to ask.
  timeZone:    text("timeZone"),
  // Defaults for the per-league identity on Membership. A league still owns its
  // own copy — the whole point of that model is that you can be "The Fridge" in
  // one league and yourself in another — but joining a league with nothing set
  // used to mean an abbreviation generated from your display name and a colour
  // picked at random. These are what it reaches for first.
  //
  // Both nullable, and null means "work it out": generateAbbreviation() and a
  // random unused colour, exactly as before.
  //
  // NOTE the colour is a *preference*, not a guarantee. pickHelmetColor keeps
  // colours unique within a league, so if someone already took yours you get
  // another one. A default that silently loses is better than a duplicate.
  defaultAbbreviation: text("defaultAbbreviation"),
  defaultHelmetColor:  text("defaultHelmetColor"),
  // Soft, reversible deactivation. Set by POST /users/me/deactivate, cleared by
  // signing in with Google again — see that route for what it does to seats.
  // A timestamp rather than a boolean so there is a record of when.
  deactivatedAt: timestamp("deactivatedAt"),
  // Age gate. A `date`, not a timestamp: a birthday is a calendar day, and
  // giving it a time would make it drift across time zones — someone born on
  // the 1st could read as the 31st to a server an hour behind them.
  //
  // Nullable for the same reason firstName is: accounts predating the gate have
  // none, and that absence is what sends them through onboarding. Stored as a
  // string ("YYYY-MM-DD") rather than a Date for the same time-zone reason.
  //
  // Self-attested and unverified — see services/age.ts for what that is and is
  // not worth.
  dateOfBirth: date("dateOfBirth"),
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
  // "BEGINNER" | "PRO" — see services/leagueLevel.ts. The only thing
  // matchmaking filters on besides size, and the only thing it will never
  // compromise on.
  //
  // This is all that remains of a browsable directory: there were also
  // `listed`, `description`, `minExperience`, `maxExperience`, `locationScope`,
  // `country` and `region`, backing search, five skill tiers and
  // country/region restriction. Players no longer see a list of open leagues at
  // all — they state a size and a level and are assigned — so every one of
  // those columns was machinery for a screen that does not exist. Do not
  // reintroduce them without the screen.
  skillLevel:         text("skillLevel").default("BEGINNER").notNull(),
  // ─── Denormalized occupancy ────────────────────────────────────────────
  // Counts of ACTIVE memberships. PENDING requests do not count — a queued
  // join has not taken a seat.
  //
  // These exist for two reasons, and the second is the important one:
  //
  //  1. Discovery filters on "has room", which without a counter means loading
  //     every league's memberships to count them. That was the whole N+1.
  //  2. They are the lock. Claiming a seat is a single conditional UPDATE that
  //     increments and asserts capacity together, so two people cannot both
  //     take the last seat. See services/leagueSeats.ts.
  //
  // Every write goes through that service. Never `insert` a membership and
  // adjust these by hand, and never trust them over a recount when repairing.
  activeMemberCount:     integer("activeMemberCount").default(0).notNull(),
  activePublicFillCount: integer("activePublicFillCount").default(0).notNull(),
  createdAt:          timestamp("createdAt").defaultNow().notNull(),
}, (t) => ({
  // Partial: `seasonStarted = false` is the predicate matchmaking opens with,
  // and it gets more selective over time — finished leagues accumulate forever
  // while open ones stay a small working set. Indexing only that slice keeps
  // the index small no matter how many seasons ship. The columns are exactly
  // what the candidate query filters on.
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
});

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
  // Every join path already catches Postgres 23505 to mean "already a member".
  // Until this existed that catch was dead code and a double join quietly
  // created two memberships — `join-by-code` had no other guard at all, so the
  // same user could queue for one league twice.
  userLeagueUniq: uniqueIndex("Membership_userId_leagueId_key").on(t.userId, t.leagueId),
  // "What leagues am I in" and "who is in this league" are the two hottest
  // lookups in the app and both were sequential scans — this table had nothing
  // but a primary key on a random UUID.
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
  // Last time odds were pulled for this game. Drives the tiered poller — the
  // cadence is a function of time-to-kickoff, so this is what makes "is this
  // game due?" answerable without tracking schedules per game.
  oddsPolledAt: timestamp("oddsPolledAt"),
  // Set once the post-game settlement fetch has graded this game's markets.
  oddsSettledAt: timestamp("oddsSettledAt"),
  homeScore:    integer("homeScore"),
  awayScore:    integer("awayScore"),
  statusDetail: text("statusDetail").default("").notNull(),
  // Nullable: ESPN only returns weather inside 10 days of kickoff, so these
  // stay null until a sync close to the game fills them in. They always arrive
  // together — ESPN never sends one without the other. `indoor` is available
  // at any distance, but is nullable too for games seeded outside ESPN.
  indoor:       boolean("indoor"),
  weather:      text("weather"),
  weatherTemp:  integer("weatherTemp"),
  // Overall W-L(-T) at the time of the last sync, e.g. "5-3" / "5-3-1".
  // A snapshot, not a live value: ESPN reports the record as it stood when we
  // fetched, so these are refreshed by the minute-by-minute score sync as well
  // as the weekly game sync. Nullable for games seeded outside ESPN.
  homeRecord:   text("homeRecord"),
  awayRecord:   text("awayRecord"),
});

export const players = pgTable("Player", {
  id:       text("id").primaryKey().$defaultFn(() => randomUUID()),
  name:     text("name").notNull(),
  team:     text("team").notNull(),
  position: text("position").notNull(),
  espnId:   text("espnId").unique(),
  // SportsGameOdds playerID, e.g. "PUKA_NACUA_1_NFL" — stable, and the key the
  // odds feed uses, so props never have to be matched by name.
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
  // "SHARP" = real book line from SharpAPI. The generator that wrote "FAKE"
  // rows is gone, so every row written now is SHARP; the column stays as the
  // marker that told the two apart and as the guard on any future import.
  source:   text("source").default("FAKE").notNull(),
  // False once a sync stops returning this market — the book pulled it. Kept
  // rather than deleted because bets may already be riding on it; hidden from
  // the board, still settled (or voided) at game end.
  available: boolean("available").default(true).notNull(),
  // SportsGameOdds oddID, e.g. "receiving_receptions-PUKA_NACUA_1_NFL-game-ou-over".
  // Settlement reads the graded value straight off this market rather than
  // matching a player name against an ESPN box score.
  oddID:    text("oddID"),
  // Real alternate-line ladder from the book, when we have one. Each entry is a
  // full over/under pair at that line. Null means "fabricate one" — the old
  // linear model in services/propOdds.ts.
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
});

export const gameLines = pgTable("GameLine", {
  id:      text("id").primaryKey().$defaultFn(() => randomUUID()),
  gameId:  text("gameId").notNull(),
  market:  text("market").notNull(),
  label:   text("label").notNull(),
  odds:    integer("odds").notNull(),
  line:    real("line"),
  result:  boolean("result"),
  // Exact tie against the line (NFL games do tie, and a whole-number total or
  // spread lands on the number). `result` alone cannot express it, and grading
  // a push as a loss quietly takes money a real book refunds.
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
});

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
});

export const parlayLegs = pgTable("ParlayLeg", {
  id:         text("id").primaryKey().$defaultFn(() => randomUUID()),
  parlayId:   text("parlayId").notNull(),
  propId:     text("propId"),
  gameLineId: text("gameLineId"),
  direction:  directionEnum("direction"),
  odds:       integer("odds").notNull(),
  altLine:    real("altLine"),
  outcome:    outcomeEnum("outcome").default("PENDING").notNull(),
});

export const leagueMessages = pgTable("LeagueMessage", {
  id:        text("id").primaryKey().$defaultFn(() => randomUUID()),
  leagueId:  text("leagueId").notNull(),
  userId:    text("userId").notNull(),
  body:      text("body").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const passwordResetTokens = pgTable("PasswordResetToken", {
  id:        text("id").primaryKey().$defaultFn(() => randomUUID()),
  userId:    text("userId").notNull(),
  token:     text("token").notNull().unique(),
  expiresAt: timestamp("expiresAt").notNull(),
  used:      boolean("used").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

// ─── Relations ───────────────────────────────────────────────────────────────

export const usersRelations = relations(users, ({ many }) => ({
  memberships:        many(memberships),
  picks:              many(picks),
  gamePicks:          many(gamePicks),
  parlays:            many(parlays),
  leagues:            many(leagues),
  homeMatchups:       many(matchups, { relationName: "homeMatchups" }),
  awayMatchups:       many(matchups, { relationName: "awayMatchups" }),
  messages:           many(leagueMessages),
  passwordResetTokens: many(passwordResetTokens),
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

export const leagueMessagesRelations = relations(leagueMessages, ({ one }) => ({
  league: one(leagues, { fields: [leagueMessages.leagueId], references: [leagues.id] }),
  user:   one(users,   { fields: [leagueMessages.userId],   references: [users.id] }),
}));

export const passwordResetTokensRelations = relations(passwordResetTokens, ({ one }) => ({
  user: one(users, { fields: [passwordResetTokens.userId], references: [users.id] }),
}));
