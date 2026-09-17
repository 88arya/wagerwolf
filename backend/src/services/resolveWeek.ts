import { db } from "../db/db";
import { eq, and, lt } from "drizzle-orm";
import { weeks, games, props, memberships, matchups } from "../db/schema";
import { triggerPostWeekActions } from "./autoPlayoffs";
import { settleFinalGame, voidBetsOnUnplayedGame } from "./settleGame";
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

/**
 * Thrown when a week cannot be closed because a game has no final score.
 *
 * A TYPE RATHER THAN A STRING MATCH, because the one caller that can do
 * something about it is the manual resolve route, and what it needs is the
 * LIST — it exists to be handed those scores. Matching on message text would
 * tie an operator-facing 409 to the wording of an error message.
 */
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

    // CANCELLED IS TERMINAL HERE. Nothing below checks the status before
    // writing `status: "FINAL"`, so a feed that answers for a cancelled game —
    // and ESPN will, for anything it has a row for — silently promoted it back
    // to FINAL and graded every bet on it against that score. A game the league
    // was told was cancelled would settle as though it had been played.
    //
    // Un-cancelling a game is a data correction, not something a resolve should
    // decide on its own. `resolveWeekById` refunds these instead; see
    // `voidBetsOnUnplayedGame`.
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
      // THE STORED SCORE IS ONLY A RESULT IF THE GAME WAS PLAYED.
      //
      // `syncESPNGames` writes a score onto every game it syncs, SCHEDULED ones
      // included — ESPN reports "0" before kickoff and `parseScore` keeps zeros
      // deliberately, because a real shutout is also 0. So an unplayed row sits
      // at 0-0, and that is a PLACEHOLDER, not a scoreless tie.
      //
      // Without the status check this branch promoted those rows to FINAL the
      // moment ESPN and SGO were both unreachable, and `settleFinalGame` then
      // graded every line on the game against 0-0: totals under, spreads by a
      // tie, moneylines off a fabricated result. Real money, invented input.
      //
      // The comment below always claimed it would "leave it pending rather than
      // guess". For a SCHEDULED game the fallback WAS the guess.
      const played = game.status !== "SCHEDULED" && game.status !== "CANCELLED";
      if (played && game.homeScore != null && game.awayScore != null) {
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
    // A CANCELLED GAME IS SETTLED BY REFUNDING IT, not by being skipped.
    // `settleFinalGame` returns on any status but FINAL, so these used to fall
    // through to the `gamesUnsettled` counter and their bets stayed PENDING for
    // good — on a week that then marked itself resolved. The stake was already
    // taken at placement, so skipping is not neutral.
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

  // A WEEK IS NOT CLOSED OVER A GAME WE COULD NOT SCORE.
  //
  // `finalizeScores` deliberately leaves a game pending when neither ESPN nor
  // SGO answers and the stored score is a pre-kickoff placeholder — the
  // `played` check in that function. But closing the week anyway finished the
  // job the other way: `resolved = true` is set unconditionally below, every bet on
  // that game stays PENDING forever, and `resolveWeekById` then refuses to run
  // again ("Week already resolved"). The refusal to invent a score only helps
  // if the week stays open long enough to get a real one.
  //
  // So: throw, and let the hourly pass try again next hour. It is safe to
  // re-enter — every settlement path in settleGame.ts filters on
  // `outcome = 'PENDING'` and every line skips an already-graded row, so the
  // games that DID settle on this attempt are not re-credited on the next.
  //
  // CANCELLED does not block. There is no score coming for a game that was
  // never played, so waiting for one would stall the week forever.
  //
  // THE TRADE, STATED PLAINLY: a game that is permanently unscoreable now
  // stalls the week, and a stalled week blocks its matchups, its standings and
  // — by the predecessor gate in scheduler.ts — every league's allowance after
  // it. That is the deliberate direction. A stall is loud (see
  // `warnOnStuckWeeks`, hourly after 24h) and reversible by hand via
  // `POST /weeks/:id/resolve`, which takes raw results for exactly this case.
  // Auto-refunding real bets because a data feed was down is neither.
  const unscored = weekGames.filter(
    (g) => g.status !== "FINAL" && g.status !== "CANCELLED"
  );
  if (unscored.length > 0) {
    const listed = unscored.map((g: any) => ({ id: g.id, label: `${g.awayTeam}@${g.homeTeam}` }));
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
