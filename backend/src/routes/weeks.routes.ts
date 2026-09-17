import { Router } from "express";
import { db } from "../db/db";
import { eq, and, inArray, gte, lte, gt, lt, asc, desc, isNull } from "drizzle-orm";
import { weeks, games, props, picks, gameLines, gamePicks, parlayLegs, parlays, memberships, matchups, leagues } from "../db/schema";
import { requireAuth, requireCron } from "../middleware/auth";
import { calcProfit } from "../lib/payout";
import { cachedPublicBoard } from "../services/publicMarkets";
import { attachBetCounts, betCountsForWeek } from "../services/betCounts";
import { currentWeekSteps } from "../services/currentWeek";
import { resolveWeekById, UnscoredGamesError } from "../services/resolveWeek";
import { distributeWeeklyAllowances } from "../services/distributeAllowances";

const router = Router();

// Helper: deeply fetch a week with games → props (with player) + gameLines
//
// Only markets still on offer. A prop or line the book has pulled is kept in
// the table (bets may be riding on it, and it still has to settle) but must not
// come back to the board, or players could keep betting a price no sportsbook
// is quoting any more.
async function fetchWeekWithGames(weekId: string) {
  return db.query.weeks.findFirst({
    where: eq(weeks.id, weekId),
    with: {
      games: {
        orderBy: [asc(games.gameDate), asc(games.id)],
        with: {
          props: { where: eq(props.available, true), with: { player: true } },
          gameLines: { where: eq(gameLines.available, true) },
        },
      },
    },
  });
}

/**
 * The current NFL week, for anyone — no token required.
 *
 * Exists so the games strip can run on the landing page and the auth funnel,
 * where there is no session yet. Everything else under /weeks stays behind
 * requireAuth.
 *
 * Deliberately NOT the same payload as `GET /?current=true`. That one embeds
 * every prop and game line for the week, which is the whole betting market;
 * this returns only what the strip actually draws — teams, kickoff, status and
 * score. Public data either way (it is the NFL schedule), but there is no
 * reason to hand the market to an unauthenticated caller.
 */
/**
 * GET /weeks/public/markets — a sample of this week's board: one prop per
 * player and one market per game, shuffled, plus the SIZE of the board it was
 * drawn from.
 *
 * THE RESPONSE IS AN OBJECT, not the bare array it used to be: { markets,
 * totals }. The landing page's subtitle counts every available line and prop on
 * the week (thousands), while the marquee under it shows ~285 — so the two
 * numbers are different questions and the sample's own length cannot answer the
 * first. One request answers both, and both describe the same week.
 *
 * UNAUTHENTICATED, and the second read in the app that is. It exists for the
 * landing page's marquee, which shows what a market looks like to someone who
 * has no account and no reason yet to want one.
 *
 * It does NOT widen /public/current, which stays fixtures-and-moneylines: this
 * is a separate, deliberately lossy projection — no prop, game or player ids,
 * no oddIDs, no alternate ladders. See services/publicMarkets.ts for what that
 * gives up and why it is enough.
 */
router.get("/public/markets", async (req: any, res: any, next: any) => {
  try {
    const raw = Number(req.query.limit);
    res.json(await cachedPublicBoard(Number.isFinite(raw) ? raw : 12));
  } catch (err: any) {
    next(err); return;
  }
});

router.get("/public/current", async (_req: any, res: any, next: any) => {
  try {
    const now = new Date();
    const withGames = {
      games: {
        orderBy: [asc(games.gameDate), asc(games.id)],
        columns: {
          id: true, weekId: true, homeTeam: true, awayTeam: true, gameDate: true,
          status: true, homeScore: true, awayScore: true, statusDetail: true,
        },
        // The two moneylines, and nothing else. The strip prints them on
        // scheduled cards, so leaving them out rendered a bare card on the
        // landing page — which is what this endpoint exists to fill.
        //
        // Still not the whole market: spreads, totals, alt lines and every
        // player prop stay behind requireAuth. A moneyline beside a fixture is
        // what any scoreboard shows; the rest is the thing you sign in to bet
        // into.
        with: {
          gameLines: {
            where: inArray(gameLines.market, ["MONEYLINE_HOME", "MONEYLINE_AWAY"]),
            columns: { id: true, gameId: true, market: true, label: true, odds: true },
          },
        },
      },
      // Deliberately NOT `as const`. Drizzle's relational-query config types
      // want mutable arrays, and `as const` froze `orderBy` into a readonly
      // tuple that no overload accepts — three errors from one keyword.
    };

    // The ladder lives in services/currentWeek.ts — the week we are inside, else
    // the next to start, else the first unresolved one. It was written out here
    // and in three other places, and the fourth copy (the landing page's board)
    // had drifted to a different rule entirely. Only the projection is local.
    let week: any = null;
    for (const step of currentWeekSteps(now)) {
      week = await db.query.weeks.findFirst({ ...step, with: withGames });
      if (week) break;
    }

    if (week) await attachBetCounts(week);
    res.json(week ? [week] : []);
  } catch (err: any) {
    next(err); return;
  }
});

/**
 * Bet counts for one week's games: { gameId: n }.
 *
 * UNAUTHENTICATED, like /public/current above and for the same reason — the
 * games strip runs on the landing page for signed-out visitors, and the counts
 * are platform-wide rather than league-scoped, so there is no league to scope
 * to and nothing here is private to one.
 *
 * Separate from the week payload deliberately. The counts change while the week
 * does not, and refetching the week to refresh them would drag every prop,
 * player and game line across the wire to update a handful of integers — and
 * would replace the client's `week` object, which restarts the strip's ticker
 * and scroll anchor. See the note on strip continuity in CLAUDE.md.
 *
 * Cached for 15s in betCounts.ts.
 */
router.get("/:weekId/bet-counts", async (req: any, res: any, next: any) => {
  try {
    res.json(await betCountsForWeek(req.params.weekId));
  } catch (err: any) {
    next(err); return;
  }
});

router.get("/", requireAuth, async (req: any, res: any, next: any) => {
  try {
    const { current, leagueId } = req.query;

    if (current === "true") {
      if (leagueId) {
        const [league] = await db.select().from(leagues).where(eq(leagues.id, String(leagueId))).limit(1);
        if (!league) { res.status(404).json({ error: "League not found" }); return; }
        const maxWeek = league.startWeek + league.regularSeasonWeeks + league.playoffWeeks - 1;
        const now = new Date();

        let week = await db.query.weeks.findFirst({
          where: and(
            eq(weeks.resolved, false),
            gte(weeks.number, league.startWeek),
            lte(weeks.number, maxWeek),
            lte(weeks.startDate, now),
            gte(weeks.endDate, now),
          ),
          orderBy: asc(weeks.number),
          with: { games: { orderBy: [asc(games.gameDate), asc(games.id)], with: { props: { with: { player: true } }, gameLines: true } } },
        });
        if (!week) {
          week = await db.query.weeks.findFirst({
            where: and(
              eq(weeks.resolved, false),
              gte(weeks.number, league.startWeek),
              lte(weeks.number, maxWeek),
              gt(weeks.startDate, now),
            ),
            orderBy: asc(weeks.startDate),
            with: { games: { orderBy: [asc(games.gameDate), asc(games.id)], with: { props: { with: { player: true } }, gameLines: true } } },
          });
        }
        if (!week) {
          week = await db.query.weeks.findFirst({
            where: and(
              eq(weeks.resolved, false),
              gte(weeks.number, league.startWeek),
              lte(weeks.number, maxWeek),
            ),
            orderBy: asc(weeks.number),
            with: { games: { orderBy: [asc(games.gameDate), asc(games.id)], with: { props: { with: { player: true } }, gameLines: true } } },
          });
        }
        if (week) await attachBetCounts(week);
        res.json(week ? [week] : []);
        return;
      }

      const now = new Date();
      // Same ladder as /public/current, from services/currentWeek.ts. This
      // branch differs only in carrying the whole market — every prop and line.
      let week: any = null;
      for (const step of currentWeekSteps(now)) {
        // The projection stays INLINE. Hoisted to a const it widens to
        // `orderBy: SQL<unknown>[]`, which no `with` overload accepts — the
        // same contextual-typing trap the `withGames` note above describes for
        // `as const`. Inline, the literal is typed by the parameter it fills.
        week = await db.query.weeks.findFirst({
          ...step,
          with: {
            games: {
              orderBy: [asc(games.gameDate), asc(games.id)],
              with: { props: { with: { player: true } }, gameLines: true },
            },
          },
        });
        if (week) break;
      }
      if (week) await attachBetCounts(week);
      res.json(week ? [week] : []);
      return;
    }

    const allWeeks = await db.query.weeks.findMany({
      orderBy: desc(weeks.number),
      with: { games: { orderBy: [asc(games.gameDate), asc(games.id)], with: { props: { with: { player: true } }, gameLines: true } } },
    });
    res.json(allWeeks);
  } catch (err: any) {
    next(err); return;
  }
});

router.get("/:id", requireAuth, async (req: any, res: any, next: any) => {
  try {
    const week = await fetchWeekWithGames(req.params.id);
    if (!week) { res.status(404).json({ error: "Week not found" }); return; }
    res.json(week);
  } catch (err: any) {
    next(err); return;
  }
});

router.delete("/:id", requireAuth, requireCron, async (req: any, res: any, next: any) => {
  try {
    const week = await db.query.weeks.findFirst({
      where: eq(weeks.id, req.params.id),
      with: { games: true },
    });
    if (!week) { res.status(404).json({ error: "Week not found" }); return; }

    const gameIds = week.games.map((g) => g.id);

    if (gameIds.length > 0) {
      // Get all prop IDs and game line IDs for these games
      const weekProps = await db.select({ id: props.id }).from(props).where(inArray(props.gameId, gameIds));
      const weekGameLines = await db.select({ id: gameLines.id }).from(gameLines).where(inArray(gameLines.gameId, gameIds));
      const propIds = weekProps.map((p) => p.id);
      const gameLineIds = weekGameLines.map((gl) => gl.id);

      if (propIds.length > 0) {
        await db.delete(parlayLegs).where(inArray(parlayLegs.propId, propIds));
        await db.delete(picks).where(inArray(picks.propId, propIds));
      }
      if (gameLineIds.length > 0) {
        await db.delete(parlayLegs).where(inArray(parlayLegs.gameLineId, gameLineIds));
        await db.delete(gamePicks).where(inArray(gamePicks.gameLineId, gameLineIds));
      }
      await db.delete(props).where(inArray(props.gameId, gameIds));
      await db.delete(gameLines).where(inArray(gameLines.gameId, gameIds));
      await db.delete(games).where(inArray(games.id, gameIds));
    }
    await db.delete(weeks).where(eq(weeks.id, req.params.id));

    res.json({ message: "Week deleted" });
  } catch (err: any) {
    next(err); return;
  }
});

router.post("/:id/lock", requireAuth, requireCron, async (req: any, res: any, next: any) => {
  try {
    const [week] = await db.select().from(weeks).where(eq(weeks.id, req.params.id)).limit(1);
    if (!week) { res.status(404).json({ error: "Week not found" }); return; }
    if (week.resolved) { res.status(400).json({ error: "Week already resolved" }); return; }
    const [updated] = await db.update(weeks)
      .set({ locked: !week.locked })
      .where(eq(weeks.id, req.params.id))
      .returning();
    res.json(updated);
  } catch (err: any) {
    next(err); return;
  }
});

/**
 * POST /weeks/:id/allowances — pay a week's allowance by hand.
 *
 * THE RECOVERY FOR `[cron] MISSED`. The hourly pass refuses to distribute a
 * week that has already kicked off, because distribution OVERWRITES balance and
 * a stake is deducted at placement — so a mid-week reset refunds every bet
 * already struck while leaving the bets live. It logs and leaves it for a
 * human. Before this route there was no way for that human to act except raw
 * SQL, which meant the refusal was effectively a permanent loss.
 *
 * `force` IS REQUIRED ONCE THE WEEK HAS STARTED, and it is not a formality —
 * it is the operator saying they have looked at the open bets and accept that
 * resetting balances will unwind them. Before kickoff there is nothing to
 * unwind and no flag is needed.
 *
 * `leagueId` scopes it to one league and writes no stamp, exactly as
 * `startLeagueSeason` does — see services/distributeAllowances. Topping up the
 * one league that was missed has not paid the week platform-wide, and claiming
 * otherwise is what made the scheduler skip everybody else.
 */
router.post("/:id/allowances", requireAuth, requireCron, async (req: any, res: any, next: any) => {
  try {
    const { id: weekId } = req.params;
    const { force, leagueId } = req.body as { force?: boolean; leagueId?: string };

    const [week] = await db.select().from(weeks).where(eq(weeks.id, weekId)).limit(1);
    if (!week) { res.status(404).json({ error: "Week not found" }); return; }

    const started = week.startDate <= new Date();
    if (started && !force) {
      res.status(409).json({
        error:
          `Week ${week.number} has already kicked off. Paying it now overwrites every ` +
          `balance, which unwinds any bet already placed on it without cancelling the ` +
          `bet. Re-send with { "force": true } to do it anyway.`,
      });
      return;
    }

    const paid = await distributeWeeklyAllowances(week.number, leagueId);
    console.log(
      `[allowances] MANUAL: week ${week.number}${leagueId ? ` (league ${leagueId})` : ""} ` +
      `paid ${paid} member(s)${started ? " AFTER KICKOFF, forced" : ""}`
    );
    res.json({ weekNumber: week.number, paid, forced: Boolean(started && force), scoped: leagueId ?? null });
  } catch (err: any) {
    next(err); return;
  }
});

/**
 * POST /weeks/:id/resolve — the manual fallback, for a week the feeds cannot
 * close on their own.
 *
 * IT INJECTS THE MISSING INPUTS AND THEN RUNS THE ORDINARY RESOLVE. It does not
 * grade anything itself, and that is the whole point of this rewrite: it used
 * to be a THIRD copy of the grading rules, beside `settleGame.ts` and
 * `resolveWeek.ts`, and it had drifted from both in four separate ways —
 *
 *   - `won = (OVER && result > line) || (UNDER && result < line)`, the exact
 *     comparison CLAUDE.md records as fixed, which grades a result landing ON
 *     the number as a LOSS for everyone holding it. Whole-number totals and
 *     spreads are ordinary and an NFL game really can end level.
 *   - game picks read `gameLine.result === true` and never looked at
 *     `gameLine.pushed`, so a pushed line lost too.
 *   - alt-line game picks were graded against the MAIN line, because nothing
 *     re-graded `altLine` against the score the way `settleGame` does.
 *   - and it never touched parlays AT ALL. No leg was graded, no ticket
 *     settled — and it marked the week resolved on the way out, so
 *     `resolveWeekById` could never come back and finish the job
 *     ("Week already resolved"). Every parlay on a manually-resolved week was
 *     stranded PENDING, permanently.
 *
 * All four are gone by construction now: the only grading authority reachable
 * from here is `services/grading.ts`, through `resolveWeekById`.
 *
 * WHAT THE BODY SUPPLIES is what the feeds could not:
 *
 *   - `gameScores` — final scores for games ESPN and SGO both failed to return.
 *     This is the one that actually unblocks a stuck week, since
 *     `resolveWeekById` now refuses to close a week over an unscored game.
 *   - `results` / `gameLineResults` — prop and line results, for markets no
 *     feed graded. Optional, and mostly unnecessary: `settleFinalGame` grades
 *     from the score on its own.
 *
 * Supplied values WIN. Both grading passes in settleGame.ts filter on
 * `result == null`, so nothing written here is overwritten by a later fetch.
 */
router.post("/:id/resolve", requireAuth, requireCron, async (req: any, res: any, next: any) => {
  try {
    const { id: weekId } = req.params;
    const { results, gameLineResults, gameScores } = req.body as {
      results?: { propId: string; result: number }[];
      gameLineResults?: { gameLineId: string; result: boolean }[];
      gameScores?: { gameId: string; homeScore: number; awayScore: number }[];
    };

    const [week] = await db.select().from(weeks).where(eq(weeks.id, weekId)).limit(1);
    if (!week) { res.status(404).json({ error: "Week not found" }); return; }
    if (week.resolved) { res.status(400).json({ error: "Week already resolved" }); return; }

    // Every id must belong to THIS week. Without the check a caller could write
    // a result onto any prop in the database by passing its id to some other
    // week's resolve — and this route's whole job is to be trusted with inputs
    // the feeds could not supply.
    const weekGames = await db.select({ id: games.id }).from(games).where(eq(games.weekId, weekId));
    const weekGameIds = new Set(weekGames.map((g) => g.id));

    if (gameScores?.length) {
      for (const { gameId, homeScore, awayScore } of gameScores) {
        if (!weekGameIds.has(gameId)) {
          res.status(400).json({ error: `Game ${gameId} is not in this week` }); return;
        }
        if (!Number.isFinite(homeScore) || !Number.isFinite(awayScore)) {
          res.status(400).json({ error: `Game ${gameId} needs both scores as numbers` }); return;
        }
      }
      for (const { gameId, homeScore, awayScore } of gameScores) {
        await db.update(games)
          .set({ homeScore, awayScore, status: "FINAL" })
          .where(eq(games.id, gameId));
      }
    }

    if (results?.length) {
      const owned = weekGameIds.size
        ? await db.select({ id: props.id }).from(props).where(inArray(props.gameId, [...weekGameIds]))
        : [];
      const ownedIds = new Set(owned.map((p) => p.id));
      const stray = results.find((r) => !ownedIds.has(r.propId));
      if (stray) { res.status(400).json({ error: `Prop ${stray.propId} is not in this week` }); return; }
      for (const { propId, result } of results) {
        await db.update(props).set({ result }).where(eq(props.id, propId));
      }
    }

    if (gameLineResults?.length) {
      const owned = weekGameIds.size
        ? await db.select({ id: gameLines.id }).from(gameLines).where(inArray(gameLines.gameId, [...weekGameIds]))
        : [];
      const ownedIds = new Set(owned.map((gl) => gl.id));
      const stray = gameLineResults.find((r) => !ownedIds.has(r.gameLineId));
      if (stray) { res.status(400).json({ error: `Game line ${stray.gameLineId} is not in this week` }); return; }
      for (const { gameLineId, result } of gameLineResults) {
        await db.update(gameLines).set({ result }).where(eq(gameLines.id, gameLineId));
      }
    }

    // THE SAME PATH THE HOURLY CRON TAKES. Scores, grading, voids, parlays,
    // the balance floor, matchups and the playoff trigger all happen in there,
    // once. If a game is still unscored it throws rather than closing the week,
    // and the message names the game — supply it in `gameScores` and run again.
    const summary = await resolveWeekById(weekId);
    res.json({ message: "Week resolved", weekId, ...summary });
  } catch (err: any) {
    // THE ONE ERROR THIS ROUTE MUST ANSWER ITSELF. Everything else goes to the
    // generic handler, which deliberately hides the detail — but this route's
    // whole purpose is to be told what the feeds could not supply, and the
    // error already knows exactly which games those are. Handing back
    // "Something went wrong" instead makes the escape hatch unusable.
    if (err instanceof UnscoredGamesError) {
      res.status(409).json({ error: err.message, games: err.games }); return;
    }
    next(err); return;
  }
});

export default router;
