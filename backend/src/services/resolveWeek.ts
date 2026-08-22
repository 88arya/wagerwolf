import { db } from "../db/db";
import { eq, and, lt } from "drizzle-orm";
import { weeks, games, props, memberships, matchups } from "../db/schema";
import { triggerPostWeekActions } from "./autoPlayoffs";
import { settleFinalGame } from "./settleGame";
import { fetchEventsByID } from "./sportsGameOdds";

/**
 * Close out a week.
 *
 * Grading itself lives in settleGame.ts and is *not* duplicated here any more.
 * It used to be: this file and settleGame.ts each carried their own copy of the
 * ESPN stat-field table and their own win/loss comparison, and they had already
 * drifted — only one of them had the player-name fix. Now this function makes
 * sure every game has a final score, hands each to settleFinalGame, and does
 * the week-level work that only it can do.
 */
async function finalizeScores(weekGames: any[]): Promise<void> {
  for (const game of weekGames) {
    if (game.status === "FINAL" && game.homeScore != null && game.awayScore != null) continue;

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
      if (game.homeScore != null && game.awayScore != null) {
        homeScore = game.homeScore;
        awayScore = game.awayScore;
      } else {
        continue;   // genuinely unknown — leave it pending rather than guess
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

export async function resolveWeekById(weekId: string): Promise<{
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
    if (game.status !== "FINAL") { gamesUnsettled++; continue; }
    try {
      await settleFinalGame(game.id);
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

  // Floor negative balances
  await db.update(memberships)
    .set({ balance: 0 })
    .where(lt(memberships.balance, 0));

  // Mark week resolved
  await db.update(weeks)
    .set({ resolved: true, locked: true })
    .where(eq(weeks.id, weekId));

  // Resolve matchups using ending balance — the balance already includes the
  // week's untouched allowance, so it IS each member's score for the week
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
