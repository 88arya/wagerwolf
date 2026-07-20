import { Router } from "express";
import { db } from "../db/db";
import { eq, and, inArray, gte, lte, gt, lt, asc, desc, isNull } from "drizzle-orm";
import { weeks, games, props, picks, gameLines, gamePicks, parlayLegs, parlays, memberships, matchups, leagues } from "../db/schema";
import { requireAuth, requireCron } from "../middleware/auth";
import { calcProfit } from "../lib/payout";

const router = Router();

// Helper: deeply fetch a week with games → props (with player) + gameLines
async function fetchWeekWithGames(weekId: string) {
  return db.query.weeks.findFirst({
    where: eq(weeks.id, weekId),
    with: {
      games: {
        orderBy: [asc(games.gameDate), asc(games.id)],
        with: {
          props: { with: { player: true } },
          gameLines: true,
        },
      },
    },
  });
}

router.get("/", requireAuth, async (req: any, res: any) => {
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
        res.json(week ? [week] : []);
        return;
      }

      const now = new Date();
      let week = await db.query.weeks.findFirst({
        where: and(eq(weeks.resolved, false), lte(weeks.startDate, now), gte(weeks.endDate, now)),
        orderBy: asc(weeks.number),
        with: { games: { orderBy: [asc(games.gameDate), asc(games.id)], with: { props: { with: { player: true } }, gameLines: true } } },
      });
      if (!week) {
        week = await db.query.weeks.findFirst({
          where: and(eq(weeks.resolved, false), gt(weeks.startDate, now)),
          orderBy: asc(weeks.startDate),
          with: { games: { orderBy: [asc(games.gameDate), asc(games.id)], with: { props: { with: { player: true } }, gameLines: true } } },
        });
      }
      if (!week) {
        week = await db.query.weeks.findFirst({
          where: eq(weeks.resolved, false),
          orderBy: asc(weeks.number),
          with: { games: { orderBy: [asc(games.gameDate), asc(games.id)], with: { props: { with: { player: true } }, gameLines: true } } },
        });
      }
      res.json(week ? [week] : []);
      return;
    }

    const allWeeks = await db.query.weeks.findMany({
      orderBy: desc(weeks.number),
      with: { games: { orderBy: [asc(games.gameDate), asc(games.id)], with: { props: { with: { player: true } }, gameLines: true } } },
    });
    res.json(allWeeks);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/:id", requireAuth, async (req: any, res: any) => {
  try {
    const week = await fetchWeekWithGames(req.params.id);
    if (!week) { res.status(404).json({ error: "Week not found" }); return; }
    res.json(week);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.delete("/:id", requireAuth, requireCron, async (req: any, res: any) => {
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
    res.status(500).json({ error: err.message });
  }
});

router.post("/:id/lock", requireAuth, requireCron, async (req: any, res: any) => {
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
    res.status(500).json({ error: err.message });
  }
});

// Manual fallback resolve (for when ESPN data is unavailable)
router.post("/:id/resolve", requireAuth, requireCron, async (req: any, res: any) => {
  try {
    const { id: weekId } = req.params;
    const { results, gameLineResults } = req.body as {
      results: { propId: string; result: number }[];
      gameLineResults?: { gameLineId: string; result: boolean }[];
    };

    const [week] = await db.select().from(weeks).where(eq(weeks.id, weekId)).limit(1);
    if (!week) { res.status(404).json({ error: "Week not found" }); return; }
    if (week.resolved) { res.status(400).json({ error: "Week already resolved" }); return; }

    for (const { propId, result } of results) {
      await db.update(props).set({ result }).where(eq(props.id, propId));
    }
    if (gameLineResults) {
      for (const { gameLineId, result } of gameLineResults) {
        await db.update(gameLines).set({ result }).where(eq(gameLines.id, gameLineId));
      }
    }

    // Resolve pending prop picks
    const weekGames = await db.select({ id: games.id }).from(games).where(eq(games.weekId, weekId));
    const weekGameIds = weekGames.map((g) => g.id);
    const weekProps = weekGameIds.length
      ? await db.select({ id: props.id }).from(props).where(inArray(props.gameId, weekGameIds))
      : [];
    const weekPropIds = weekProps.map((p) => p.id);

    const pendingPicks = weekPropIds.length
      ? await db.query.picks.findMany({
          where: and(eq(picks.outcome, "PENDING"), inArray(picks.propId, weekPropIds)),
          with: { prop: true },
        }) as any[]
      : [];

    for (const pick of pendingPicks) {
      const { result } = pick.prop;
      if (result === null) continue;
      const effectiveLine = pick.altLine ?? pick.prop.line;
      const won = (pick.direction === "OVER" && result > effectiveLine) ||
                  (pick.direction === "UNDER" && result < effectiveLine);
      const profit = won ? calcProfit(Number(pick.stake), pick.odds) : 0;
      await db.update(picks).set({ outcome: won ? "WIN" : "LOSS" }).where(eq(picks.id, pick.id));
      const [mem] = await db.select().from(memberships)
        .where(and(eq(memberships.userId, pick.userId), eq(memberships.leagueId, pick.leagueId)))
        .limit(1);
      if (mem) {
        await db.update(memberships)
          .set(won
            ? { balance: mem.balance + Number(pick.stake) + profit, weeklyWinnings: mem.weeklyWinnings + profit }
            : { weeklyWinnings: mem.weeklyWinnings - Number(pick.stake) })
          .where(and(eq(memberships.userId, pick.userId), eq(memberships.leagueId, pick.leagueId)));
      }
    }

    // Resolve pending game picks
    const weekGameLineIds = weekGameIds.length
      ? (await db.select({ id: gameLines.id }).from(gameLines).where(inArray(gameLines.gameId, weekGameIds))).map((gl) => gl.id)
      : [];

    const pendingGamePicks = weekGameLineIds.length
      ? await db.query.gamePicks.findMany({
          where: and(eq(gamePicks.outcome, "PENDING"), inArray(gamePicks.gameLineId, weekGameLineIds)),
          with: { gameLine: { with: { game: true } } },
        }) as any[]
      : [];

    for (const gp of pendingGamePicks) {
      if (gp.gameLine.result == null) continue;
      const won: boolean = gp.gameLine.result === true;
      const profit = won ? calcProfit(Number(gp.stake), gp.odds) : 0;
      await db.update(gamePicks).set({ outcome: won ? "WIN" : "LOSS" }).where(eq(gamePicks.id, gp.id));
      const [mem] = await db.select().from(memberships)
        .where(and(eq(memberships.userId, gp.userId), eq(memberships.leagueId, gp.leagueId)))
        .limit(1);
      if (mem) {
        await db.update(memberships)
          .set(won
            ? { balance: mem.balance + Number(gp.stake) + profit, weeklyWinnings: mem.weeklyWinnings + profit }
            : { weeklyWinnings: mem.weeklyWinnings - Number(gp.stake) })
          .where(and(eq(memberships.userId, gp.userId), eq(memberships.leagueId, gp.leagueId)));
      }
    }

    // Floor balances at 0
    const negativeMembers = await db.select().from(memberships).where(lt(memberships.balance, 0));
    for (const mem of negativeMembers) {
      await db.update(memberships).set({ balance: 0 }).where(eq(memberships.id, mem.id));
    }

    await db.update(weeks).set({ resolved: true, locked: true }).where(eq(weeks.id, weekId));

    // Resolve matchups
    const pendingMatchups = await db.select().from(matchups)
      .where(and(eq(matchups.weekNumber, week.number), isNull(matchups.winnerId), eq(matchups.isTie, false)));

    for (const matchup of pendingMatchups) {
      const [homeMem, awayMem] = await Promise.all([
        db.select().from(memberships)
          .where(and(eq(memberships.userId, matchup.homeUserId), eq(memberships.leagueId, matchup.leagueId)))
          .limit(1),
        db.select().from(memberships)
          .where(and(eq(memberships.userId, matchup.awayUserId), eq(memberships.leagueId, matchup.leagueId)))
          .limit(1),
      ]);
      const homeProfit = homeMem[0]?.weeklyWinnings ?? 0;
      const awayProfit = awayMem[0]?.weeklyWinnings ?? 0;
      const isTie = homeProfit === awayProfit;
      const winnerId = isTie ? null : homeProfit > awayProfit ? matchup.homeUserId : matchup.awayUserId;
      await db.update(matchups)
        .set({ homeProfit, awayProfit, winnerId, isTie })
        .where(eq(matchups.id, matchup.id));
    }

    res.json({ message: "Week resolved", weekId });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
