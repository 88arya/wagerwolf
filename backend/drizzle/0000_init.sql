CREATE TYPE "public"."Direction" AS ENUM('OVER', 'UNDER');--> statement-breakpoint
CREATE TYPE "public"."MembershipStatus" AS ENUM('PENDING', 'ACTIVE');--> statement-breakpoint
CREATE TYPE "public"."Outcome" AS ENUM('PENDING', 'WIN', 'LOSS', 'VOID', 'PUSH');--> statement-breakpoint
CREATE TYPE "public"."StatType" AS ENUM('PASSING_YARDS', 'PASSING_TOUCHDOWNS', 'PASSING_COMPLETIONS', 'PASSING_ATTEMPTS', 'PASSING_INTERCEPTIONS', 'PASSING_LONGEST', 'RUSHING_YARDS', 'RUSHING_TOUCHDOWNS', 'RUSHING_ATTEMPTS', 'RUSHING_LONGEST', 'RECEIVING_YARDS', 'RECEIVING_TOUCHDOWNS', 'RECEIVING_LONGEST', 'RECEIVING_TARGETS', 'RECEPTIONS', 'SACKS', 'TACKLES_ASSISTS', 'DEFENSIVE_INTERCEPTIONS', 'FIELD_GOALS_MADE', 'FIELD_GOAL_LONGEST', 'KICKING_POINTS', 'EXTRA_POINTS_MADE', 'TOUCHDOWNS');--> statement-breakpoint
CREATE TABLE "GameLine" (
	"id" text PRIMARY KEY NOT NULL,
	"gameId" text NOT NULL,
	"market" text NOT NULL,
	"label" text NOT NULL,
	"odds" integer NOT NULL,
	"line" real,
	"result" boolean,
	"pushed" boolean DEFAULT false NOT NULL,
	"available" boolean DEFAULT true NOT NULL,
	"oddID" text
);
--> statement-breakpoint
CREATE TABLE "GamePick" (
	"id" text PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"leagueId" text NOT NULL,
	"gameLineId" text NOT NULL,
	"stake" integer NOT NULL,
	"odds" integer NOT NULL,
	"altLine" real,
	"outcome" "Outcome" DEFAULT 'PENDING' NOT NULL,
	"cashedOut" boolean DEFAULT false NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"voidReason" text
);
--> statement-breakpoint
CREATE TABLE "Game" (
	"id" text PRIMARY KEY NOT NULL,
	"weekId" text NOT NULL,
	"homeTeam" text NOT NULL,
	"awayTeam" text NOT NULL,
	"gameDate" timestamp NOT NULL,
	"status" text DEFAULT 'SCHEDULED' NOT NULL,
	"externalId" text,
	"espnId" text,
	"oddsPolledAt" timestamp,
	"oddsSettledAt" timestamp,
	"homeScore" integer,
	"awayScore" integer,
	"statusDetail" text DEFAULT '' NOT NULL,
	"indoor" boolean,
	"weather" text,
	"weatherTemp" integer,
	"homeRecord" text,
	"awayRecord" text,
	CONSTRAINT "Game_externalId_unique" UNIQUE("externalId"),
	CONSTRAINT "Game_espnId_unique" UNIQUE("espnId")
);
--> statement-breakpoint
CREATE TABLE "LeagueMessage" (
	"id" text PRIMARY KEY NOT NULL,
	"leagueId" text NOT NULL,
	"userId" text NOT NULL,
	"body" text NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "League" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"weeklyAllowance" integer NOT NULL,
	"inviteCode" text NOT NULL,
	"creatorId" text NOT NULL,
	"seasonStarted" boolean DEFAULT false NOT NULL,
	"seasonEnded" boolean DEFAULT false NOT NULL,
	"championId" text,
	"isPublic" boolean DEFAULT false NOT NULL,
	"maxPlayers" integer DEFAULT 10 NOT NULL,
	"startWeek" integer DEFAULT 1 NOT NULL,
	"regularSeasonWeeks" integer DEFAULT 13 NOT NULL,
	"playoffWeeks" integer DEFAULT 3 NOT NULL,
	"playoffSize" integer DEFAULT 4 NOT NULL,
	"consolationTeams" integer DEFAULT 6 NOT NULL,
	"consolationWeeks" integer DEFAULT 2 NOT NULL,
	"hasGhost" boolean DEFAULT false NOT NULL,
	"autoStartAt" timestamp,
	"maxPublicPlayers" integer DEFAULT 0 NOT NULL,
	"maxStakePerBet" integer,
	"maxBetsPerWeek" integer,
	"maxParlayLegs" integer DEFAULT 10,
	"feedVisibility" text DEFAULT 'AFTER_KICKOFF' NOT NULL,
	"skillLevel" text DEFAULT 'BEGINNER' NOT NULL,
	"activeMemberCount" integer DEFAULT 0 NOT NULL,
	"activePublicFillCount" integer DEFAULT 0 NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "League_inviteCode_unique" UNIQUE("inviteCode")
);
--> statement-breakpoint
CREATE TABLE "Matchup" (
	"id" text PRIMARY KEY NOT NULL,
	"leagueId" text NOT NULL,
	"weekNumber" integer NOT NULL,
	"homeUserId" text NOT NULL,
	"awayUserId" text NOT NULL,
	"homeProfit" integer,
	"awayProfit" integer,
	"winnerId" text,
	"isTie" boolean DEFAULT false NOT NULL,
	"isBye" boolean DEFAULT false NOT NULL,
	"isPlayoff" boolean DEFAULT false NOT NULL,
	"isConsolation" boolean DEFAULT false NOT NULL,
	"isGhostMatchup" boolean DEFAULT false NOT NULL,
	"playoffRound" integer,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "Membership" (
	"id" text PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"leagueId" text NOT NULL,
	"balance" integer NOT NULL,
	"status" "MembershipStatus" DEFAULT 'ACTIVE' NOT NULL,
	"isPublicFill" boolean DEFAULT false NOT NULL,
	"helmetColor" text DEFAULT '#2563EB' NOT NULL,
	"displayName" text DEFAULT '' NOT NULL,
	"abbreviation" text DEFAULT '' NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ParlayLeg" (
	"id" text PRIMARY KEY NOT NULL,
	"parlayId" text NOT NULL,
	"propId" text,
	"gameLineId" text,
	"direction" "Direction",
	"odds" integer NOT NULL,
	"altLine" real,
	"outcome" "Outcome" DEFAULT 'PENDING' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "Parlay" (
	"id" text PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"leagueId" text NOT NULL,
	"stake" integer NOT NULL,
	"totalOdds" integer NOT NULL,
	"payout" integer NOT NULL,
	"outcome" "Outcome" DEFAULT 'PENDING' NOT NULL,
	"cashedOut" boolean DEFAULT false NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"voidReason" text
);
--> statement-breakpoint
CREATE TABLE "PasswordResetToken" (
	"id" text PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"token" text NOT NULL,
	"expiresAt" timestamp NOT NULL,
	"used" boolean DEFAULT false NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "PasswordResetToken_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "Pick" (
	"id" text PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"leagueId" text NOT NULL,
	"propId" text NOT NULL,
	"direction" "Direction" NOT NULL,
	"stake" integer NOT NULL,
	"odds" integer DEFAULT -110 NOT NULL,
	"altLine" real,
	"outcome" "Outcome" DEFAULT 'PENDING' NOT NULL,
	"cashedOut" boolean DEFAULT false NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"voidReason" text
);
--> statement-breakpoint
CREATE TABLE "Player" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"team" text NOT NULL,
	"position" text NOT NULL,
	"espnId" text,
	"sgoId" text,
	"imageUrl" text,
	"jersey" text,
	CONSTRAINT "Player_espnId_unique" UNIQUE("espnId"),
	CONSTRAINT "Player_sgoId_unique" UNIQUE("sgoId")
);
--> statement-breakpoint
CREATE TABLE "Prop" (
	"id" text PRIMARY KEY NOT NULL,
	"gameId" text NOT NULL,
	"playerId" text NOT NULL,
	"statType" "StatType" NOT NULL,
	"line" real NOT NULL,
	"odds" integer DEFAULT -110 NOT NULL,
	"result" real,
	"source" text DEFAULT 'FAKE' NOT NULL,
	"available" boolean DEFAULT true NOT NULL,
	"oddID" text,
	"altLadder" jsonb
);
--> statement-breakpoint
CREATE TABLE "User" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"password" text,
	"googleId" text,
	"name" text NOT NULL,
	"displayName" text NOT NULL,
	"firstName" text,
	"lastName" text,
	"timeZone" text,
	"defaultAbbreviation" text,
	"defaultHelmetColor" text,
	"deactivatedAt" timestamp,
	"ageConfirmedAt" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "User_email_unique" UNIQUE("email"),
	CONSTRAINT "User_googleId_unique" UNIQUE("googleId")
);
--> statement-breakpoint
CREATE TABLE "Week" (
	"id" text PRIMARY KEY NOT NULL,
	"number" integer NOT NULL,
	"startDate" timestamp NOT NULL,
	"endDate" timestamp NOT NULL,
	"resolved" boolean DEFAULT false NOT NULL,
	"locked" boolean DEFAULT false NOT NULL,
	"allowanceDistributed" boolean DEFAULT false NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "Week_number_unique" UNIQUE("number")
);
--> statement-breakpoint
CREATE UNIQUE INDEX "GameLine_gameId_market_key" ON "GameLine" USING btree ("gameId","market");--> statement-breakpoint
CREATE INDEX "League_match_idx" ON "League" USING btree ("skillLevel","startWeek","maxPlayers","isPublic") WHERE "seasonStarted" = false;--> statement-breakpoint
CREATE UNIQUE INDEX "Membership_userId_leagueId_key" ON "Membership" USING btree ("userId","leagueId");--> statement-breakpoint
CREATE INDEX "Membership_userId_idx" ON "Membership" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "Membership_leagueId_idx" ON "Membership" USING btree ("leagueId");--> statement-breakpoint
CREATE UNIQUE INDEX "Player_name_team_key" ON "Player" USING btree ("name","team");--> statement-breakpoint
CREATE UNIQUE INDEX "Prop_gameId_playerId_statType_key" ON "Prop" USING btree ("gameId","playerId","statType");