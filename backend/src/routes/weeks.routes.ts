import { Router } from "express";
import { db } from "../db/db";
import { eq, inArray, asc, desc } from "drizzle-orm";
import { weeks, games, props, picks, gameLines, gamePicks, parlayLegs, leagues } from "../db/schema";
import { requireAuth, requireCron } from "../middleware/auth";
import { cachedPublicBoard } from "../services/publicMarkets";
import { attachBetCounts, betCountsForWeek } from "../services/betCounts";
import { currentWeekSteps } from "../services/currentWeek";
import { marketsForGames, invalidateAllMarkets } from "../services/weekBoard";
import { cachedResponse, sendBuilt } from "../services/boardResponse";
import { resolveWeekById, UnscoredGamesError } from "../services/resolveWeek";
import { distributeWeeklyAllowances } from "../services/distributeAllowances";

const router = Router();

// Only markets still on offer; pulled ones stay in the DB to settle.
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

// Unauthenticated board sample for the landing page (see services/publicMarkets).
router.get("/public/markets", async (req, res, next) => {
  try {
    const raw = Number(req.query.limit);
    res.json(await cachedPublicBoard(Number.isFinite(raw) ? raw : 12));
  } catch (err) {
    next(err); return;
  }
});

// Unauthenticated: current week's games plus moneylines, for the games strip.
router.get("/public/current", async (_req, res, next) => {
  try {
    const now = new Date();
    const withGames = {
      games: {
        orderBy: [asc(games.gameDate), asc(games.id)],
        columns: {
          id: true, weekId: true, homeTeam: true, awayTeam: true, gameDate: true,
          status: true, homeScore: true, awayScore: true, statusDetail: true,
        },
        with: {
          gameLines: {
            where: inArray(gameLines.market, ["MONEYLINE_HOME", "MONEYLINE_AWAY"]),
            columns: { id: true, gameId: true, market: true, label: true, odds: true },
          },
        },
      },
    };

    let week: any = null;
    for (const step of currentWeekSteps(now)) {
      week = await db.query.weeks.findFirst({ ...step, columns: { publicBoard: false }, with: withGames });
      if (week) break;
    }

    if (week) await attachBetCounts(week);
    res.json(week ? [week] : []);
  } catch (err) {
    next(err); return;
  }
});

// Kept separate from the week payload so refreshing counts doesn't refetch the board.
router.get("/:weekId/bet-counts", async (req, res, next) => {
  try {
    res.json(await betCountsForWeek(req.params.weekId));
  } catch (err) {
    next(err); return;
  }
});

router.get("/", requireAuth, async (req, res, next) => {
  try {
    const { current, leagueId } = req.query;
    // markets=none for pages that only need the week and games.
    const withMarkets = req.query.markets !== "none";

    if (current === "true") {
      const now = new Date();
      let range: { min: number; max: number } | undefined;
      if (leagueId) {
        const [league] = await db.select().from(leagues).where(eq(leagues.id, String(leagueId))).limit(1);
        if (!league) { res.status(404).json({ error: "League not found" }); return; }
        range = {
          min: league.startWeek,
          max: league.startWeek + league.regularSeasonWeeks + league.playoffWeeks - 1,
        };
      }
      let week: any = null;
      for (const step of currentWeekSteps(now, range)) {
        week = await db.query.weeks.findFirst({ ...step, columns: { publicBoard: false } });
        if (week) break;
      }
      if (!week) { res.json([]); return; }

      // Same for every caller, so built once and served as gzipped bytes.
      const built = await cachedResponse(`week:${week.id}:${withMarkets ? "full" : "lite"}`, async () => {
        const gameRows: any[] = await db.query.games.findMany({
          where: eq(games.weekId, week.id),
          orderBy: [asc(games.gameDate), asc(games.id)],
        });
        const full: any = { ...week, games: gameRows };
        if (withMarkets) {
          const markets = await marketsForGames(gameRows.map((g) => g.id));
          for (const g of gameRows) {
            const m = markets.get(g.id);
            g.props = m?.props ?? [];
            g.gameLines = m?.gameLines ?? [];
          }
        }
        await attachBetCounts(full);
        return [full];
      });
      sendBuilt(req, res, built);
      return;
    }

    const allWeeks = await db.query.weeks.findMany({
      orderBy: desc(weeks.number),
      with: { games: { orderBy: [asc(games.gameDate), asc(games.id)], with: { props: { with: { player: true } }, gameLines: true } } },
    });
    res.json(allWeeks);
  } catch (err) {
    next(err); return;
  }
});

router.get("/:id", requireAuth, async (req, res, next) => {
  try {
    const week = await fetchWeekWithGames(req.params.id);
    if (!week) { res.status(404).json({ error: "Week not found" }); return; }
    res.json(week);
  } catch (err) {
    next(err); return;
  }
});

router.delete("/:id", requireAuth, requireCron, async (req, res, next) => {
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
    invalidateAllMarkets();

    res.json({ message: "Week deleted" });
  } catch (err) {
    next(err); return;
  }
});

router.post("/:id/lock", requireAuth, requireCron, async (req, res, next) => {
  try {
    const [week] = await db.select().from(weeks).where(eq(weeks.id, req.params.id)).limit(1);
    if (!week) { res.status(404).json({ error: "Week not found" }); return; }
    if (week.resolved) { res.status(400).json({ error: "Week already resolved" }); return; }
    const [updated] = await db.update(weeks)
      .set({ locked: !week.locked })
      .where(eq(weeks.id, req.params.id))
      .returning();
    res.json(updated);
  } catch (err) {
    next(err); return;
  }
});

// Manual allowance payout for a week the scheduler skipped. After kickoff this
// resets live balances, so it requires `force`.
router.post("/:id/allowances", requireAuth, requireCron, async (req, res, next) => {
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
  } catch (err) {
    next(err); return;
  }
});

// Manual resolve: supplies missing scores/results, then runs the normal
// resolveWeekById. Supplied values aren't overwritten by later fetches.
router.post("/:id/resolve", requireAuth, requireCron, async (req, res, next) => {
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

    // Every id must belong to this week.
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
      invalidateAllMarkets();
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
      invalidateAllMarkets();
    }

    const summary = await resolveWeekById(weekId);
    res.json({ message: "Week resolved", weekId, ...summary });
  } catch (err) {
    // Return which games need scores so the caller can supply them.
    if (err instanceof UnscoredGamesError) {
      res.status(409).json({ error: err.message, games: err.games }); return;
    }
    next(err); return;
  }
});

export default router;
