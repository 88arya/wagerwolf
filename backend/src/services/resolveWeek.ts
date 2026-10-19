import { db } from "../db/db";
import { eq, lt } from "drizzle-orm";
import { weeks, games, memberships, matchups } from "../db/schema";
import { triggerPostWeekActions } from "./autoPlayoffs";
import { settleFinalGame, voidBetsOnUnplayedGame } from "./settleGame";
import { fetchEventsByID } from "./sportsGameOdds";

// Carries the unscored games so the manual resolve route can ask for them.
export class UnscoredGamesError extends Error {
  constructor(message: string, readonly games: { id: string; label: string }[]) {
    super(message);
    this.name = "UnscoredGamesError";
  }
}

const CANCELLED_REASON = "Game cancelled — stake refunded";

async function finalizeScores(weekGames: any[]): Promise<void> {
  for (const game of weekGames) {
    if (game.status === "FINAL" && game.homeScore != null && game.awayScore != null) continue;

    // Never promote a cancelled game back to FINAL; it gets refunded instead.
    if (game.status === "CANCELLED") continue;

    let homeScore: number | null = null;
    let awayScore: number | null = null;

    if (game.espnId) {
      try {
        const res = await fetch(
          `https://site.api.espn.com/apis/site/v2/sports/football/nfl/summary?event=${game.espnId}`
        );
        const summary: any = await res.json();
        for (const c of summary?.header?.competitions?.[0]?.competitors ?? []) {
          const score = parseInt(c.score, 10);
          if (!Number.isFinite(score)) continue;
          if (c.homeAway === "home") homeScore = score; else awayScore = score;
        }
      } catch { /* fall through to SGO */ }
    }

    if ((homeScore == null || awayScore == null) && game.externalId) {
      try {
        const [ev] = await fetchEventsByID([game.externalId]);
        if (ev?.homeScore != null && ev?.awayScore != null) {
          homeScore = ev.homeScore;
          awayScore = ev.awayScore;
        }
      } catch { /* leave unscored */ }
    }

    if (homeScore == null || awayScore == null) {
      // ESPN reports 0-0 before kickoff, so a stored score only counts once the game started.
      const played = game.status !== "SCHEDULED" && game.status !== "CANCELLED";
      if (played && game.homeScore != null && game.awayScore != null) {
        homeScore = game.homeScore;
        awayScore = game.awayScore;
      } else {
        continue;   // genuinely unknown - leave it pending rather than guess
      }
    }

    await db.update(games)
      .set({ homeScore, awayScore, status: "FINAL" })
      .where(eq(games.id, game.id));
    game.homeScore = homeScore;
    game.awayScore = awayScore;
    game.status = "FINAL";
  }
}

// `early` is the rollover. Any other caller is final, so settlement stops waiting on SGO.
export async function resolveWeekById(weekId: string, opts: { early?: boolean } = {}): Promise<{
  propsMatched: number; propsUnmatched: number;
  gamesSettled: number; gamesUnsettled: number;
}> {
  const week = await db.query.weeks.findFirst({
    where: eq(weeks.id, weekId),
    with: { games: true },
  });

  if (!week) throw new Error("Week not found");
  if (week.resolved) throw new Error("Week already resolved");

  const weekGames = (week as any).games as any[];

  await finalizeScores(weekGames);

  let gamesSettled = 0, gamesUnsettled = 0;
  for (const game of weekGames) {
    // Refund bets on cancelled games rather than leaving them pending.
    if (game.status === "CANCELLED") {
      try {
        await voidBetsOnUnplayedGame(game.id, CANCELLED_REASON);
        gamesSettled++;
      } catch (err) {
        console.error(`[resolve] Failed to void cancelled game ${game.id}:`, err);
        gamesUnsettled++;
      }
      continue;
    }
    if (game.status !== "FINAL") { gamesUnsettled++; continue; }
    try {
      await settleFinalGame(game.id, !opts.early);
      gamesSettled++;
    } catch (err) {
      console.error(`[resolve] Failed to settle game ${game.id}:`, err);
      gamesUnsettled++;
    }
  }

  const gameIds = weekGames.map((g) => g.id);
  const weekProps = gameIds.length > 0
    ? await db.query.props.findMany({ where: (p, { inArray }) => inArray(p.gameId, gameIds) })
    : [];
  const propsMatched = weekProps.filter((p) => p.result != null).length;
  const propsUnmatched = weekProps.length - propsMatched;

  // Don't close a week over a game with no score; throw and retry next tick.
  // Re-entry is safe because settlement only touches PENDING bets.
  const unscored = weekGames.filter(
    (g) => g.status !== "FINAL" && g.status !== "CANCELLED"
  );
  if (unscored.length > 0) {
    const listed = unscored.map((g) => ({ id: g.id, label: `${g.awayTeam}@${g.homeTeam}` }));
    throw new UnscoredGamesError(
      `Week ${week.number} has ${unscored.length} game(s) with no final score ` +
      `(${listed.map((g) => g.label).join(", ")}) — leaving the week open so the ` +
      `next run can score them. Supply them in \`gameScores\` to ` +
      `POST /weeks/${weekId}/resolve if no score is ever coming.`,
      listed,
    );
  }

  // Floor negative balances
  await db.update(memberships)
    .set({ balance: 0 })
    .where(lt(memberships.balance, 0));

  // Mark week resolved
  await db.update(weeks)
    .set({ resolved: true, locked: true })
    .where(eq(weeks.id, weekId));

  const pendingMatchups = await db.query.matchups.findMany({
    where: (m, { and, eq, isNull }) =>
      and(eq(m.weekNumber, week.number), isNull(m.winnerId), eq(m.isTie, false)),
  });

  const leagueMeanCache: Record<string, number> = {};
  for (const matchup of pendingMatchups) {
    const [homeMem, awayMem] = await Promise.all([
      db.query.memberships.findFirst({
        where: (m, { and, eq }) =>
          and(eq(m.userId, matchup.homeUserId), eq(m.leagueId, matchup.leagueId)),
      }),
      db.query.memberships.findFirst({
        where: (m, { and, eq }) =>
          and(eq(m.userId, matchup.awayUserId), eq(m.leagueId, matchup.leagueId)),
      }),
    ]);

    let homeProfit = homeMem?.balance ?? 0;
    let awayProfit = awayMem?.balance ?? 0;

    if (matchup.isGhostMatchup) {
      if (!(matchup.leagueId in leagueMeanCache)) {
        const mems = await db.query.memberships.findMany({
          where: (m, { and, eq }) =>
            and(eq(m.leagueId, matchup.leagueId), eq(m.status, "ACTIVE")),
        });
        leagueMeanCache[matchup.leagueId] = mems.length > 0
          ? mems.reduce((s, m) => s + m.balance, 0) / mems.length
          : 0;
      }
      const mean = leagueMeanCache[matchup.leagueId];
      if (!homeMem) homeProfit = mean;
      if (!awayMem) awayProfit = mean;
    }

    const isTie = homeProfit === awayProfit;
    const winnerId = isTie ? null : homeProfit > awayProfit ? matchup.homeUserId : matchup.awayUserId;
    await db.update(matchups)
      .set({ homeProfit, awayProfit, winnerId, isTie })
      .where(eq(matchups.id, matchup.id));
  }

  // Trigger playoff check after matchups are resolved
  await triggerPostWeekActions(week.number);

  console.log(`[resolve] Week ${week.number} resolved — games settled: ${gamesSettled}/${gamesSettled + gamesUnsettled}, props graded: ${propsMatched}/${propsMatched + propsUnmatched}`);
  return { propsMatched, propsUnmatched, gamesSettled, gamesUnsettled };
}
