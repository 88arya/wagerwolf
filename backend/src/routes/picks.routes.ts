import { Router } from "express";
import { db } from "../db/db";
import { eq, and, inArray, count, sql } from "drizzle-orm";
import { picks, memberships, leagues, props, games, gamePicks, gameLines } from "../db/schema";
import { requireAuth } from "../middleware/auth";
import { calcProfit, fmtMoney } from "../lib/payout";

const router = Router();

const STAT_STEP: Record<string, number> = {
  PASSING_YARDS: 5, RUSHING_YARDS: 5, RECEIVING_YARDS: 5,
  TOUCHDOWNS: 0.5, RECEPTIONS: 0.5,
};

function calcPropAltOdds(baseOdds: number, baseLine: number, altLine: number, statType: string, direction: string): number {
  const step = STAT_STEP[statType] ?? 0.5;
  const steps = (altLine - baseLine) / step;
  const favSteps = direction === "OVER" ? -steps : steps;
  return Math.max(-500, Math.min(500, baseOdds - Math.round(favSteps * 15)));
}

router.post("/", requireAuth, async (req: any, res: any) => {
  try {
    const { leagueId, propId, direction, stake, altLine } = req.body;
    const userId = req.userId;

    if (!leagueId || !propId || !direction || stake == null) {
      res.status(400).json({ error: "leagueId, propId, direction, and stake are required" });
      return;
    }
    if (Number(stake) <= 0 || !Number.isInteger(Number(stake))) {
      res.status(400).json({ error: "Stake must be a whole number of cents greater than 0" });
      return;
    }

    const prop = await db.query.props.findFirst({
      where: eq(props.id, propId),
      with: { game: { with: { week: true } } },
    }) as any;

    if (!prop) { res.status(404).json({ error: "Prop not found" }); return; }
    if (prop.game.status === "CANCELLED") { res.status(400).json({ error: "This game has been cancelled" }); return; }
    if (prop.game.week.locked) { res.status(400).json({ error: "This week is locked" }); return; }
    if (prop.game.week.resolved) { res.status(400).json({ error: "This week is already resolved" }); return; }

    // Per-game kickoff lock
    if (new Date(prop.game.gameDate) <= new Date()) {
      res.status(400).json({ error: "This game has already kicked off — bets are locked" }); return;
    }

    const [membership] = await db.select().from(memberships)
      .where(and(eq(memberships.userId, userId), eq(memberships.leagueId, leagueId)))
      .limit(1);
    if (!membership) { res.status(404).json({ error: "Not a member of this league" }); return; }
    if (membership.balance < Number(stake)) {
      res.status(400).json({ error: "Insufficient balance" });
      return;
    }

    // Rule 2: cannot bet opposite direction while a pending pick exists on same prop
    const oppositeDir = direction === "OVER" ? "UNDER" : "OVER";
    const pendingOpposite = await db.query.picks.findFirst({
      where: and(
        eq(picks.userId, userId),
        eq(picks.leagueId, leagueId),
        eq(picks.propId, propId),
        eq(picks.direction, oppositeDir as any),
        eq(picks.outcome, "PENDING"),
      ),
    });
    if (pendingOpposite) { res.status(409).json({ error: "You have an active bet on the opposite side — cash out first" }); return; }

    const [league] = await db.select({
      maxStakePerBet: leagues.maxStakePerBet,
      maxBetsPerWeek: leagues.maxBetsPerWeek,
    }).from(leagues).where(eq(leagues.id, leagueId)).limit(1);

    if (league?.maxStakePerBet && Number(stake) > league.maxStakePerBet) {
      res.status(400).json({ error: `Max stake per bet is ${fmtMoney(league.maxStakePerBet)}` }); return;
    }
    if (league?.maxBetsPerWeek) {
      // Get all game IDs for this week
      const weekGames = await db.select({ id: games.id })
        .from(games)
        .where(eq(games.weekId, prop.game.weekId));
      const weekGameIds = weekGames.map((g: any) => g.id);

      // Get all prop IDs for games in this week
      const weekProps = weekGameIds.length > 0
        ? await db.select({ id: props.id }).from(props).where(inArray(props.gameId, weekGameIds))
        : [];
      const weekPropIds = weekProps.map((p: any) => p.id);

      // Get all game line IDs for games in this week
      const weekGameLines = weekGameIds.length > 0
        ? await db.select({ id: gameLines.id }).from(gameLines).where(inArray(gameLines.gameId, weekGameIds))
        : [];
      const weekGameLineIds = weekGameLines.map((gl: any) => gl.id);

      const [{ value: weekPickCount }] = await db.select({ value: count() })
        .from(picks)
        .where(and(
          eq(picks.userId, userId),
          eq(picks.leagueId, leagueId),
          weekPropIds.length > 0 ? inArray(picks.propId, weekPropIds) : sql`false`,
        ));
      const [{ value: weekGamePickCount }] = await db.select({ value: count() })
        .from(gamePicks)
        .where(and(
          eq(gamePicks.userId, userId),
          eq(gamePicks.leagueId, leagueId),
          weekGameLineIds.length > 0 ? inArray(gamePicks.gameLineId, weekGameLineIds) : sql`false`,
        ));

      if (weekPickCount + weekGamePickCount >= league.maxBetsPerWeek) {
        res.status(400).json({ error: `Maximum ${league.maxBetsPerWeek} bets per week` }); return;
      }
    }

    const effectiveOdds = (altLine != null && prop.line != null)
      ? calcPropAltOdds(prop.odds, prop.line, Number(altLine), prop.statType, direction)
      : prop.odds;

    const [pick] = await db.insert(picks).values({
      userId, leagueId, propId, direction, stake: Number(stake),
      odds: effectiveOdds,
      altLine: altLine != null ? Number(altLine) : null,
    }).returning();

    await db.update(memberships)
      .set({ balance: sql`${memberships.balance} - ${Number(stake)}` })
      .where(and(eq(memberships.userId, userId), eq(memberships.leagueId, leagueId)));

    res.status(201).json(pick);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/", requireAuth, async (req: any, res: any) => {
  try {
    const { leagueId } = req.query;

    const whereClause = leagueId
      ? and(eq(picks.userId, req.userId), eq(picks.leagueId, String(leagueId)))
      : eq(picks.userId, req.userId);

    const rows = await db.query.picks.findMany({
      where: whereClause,
      with: { prop: { with: { player: true, game: { with: { week: true } } } } },
      orderBy: (picks, { desc }) => [desc(picks.createdAt)],
    });

    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Cashout a pending prop pick before kickoff — full stake refund
router.post("/:id/cashout", requireAuth, async (req: any, res: any) => {
  try {
    const pick = await db.query.picks.findFirst({
      where: eq(picks.id, req.params.id),
      with: { prop: { with: { game: true } } },
    }) as any;

    if (!pick) { res.status(404).json({ error: "Pick not found" }); return; }
    if (pick.userId !== req.userId) { res.status(403).json({ error: "Not your pick" }); return; }
    if (pick.outcome !== "PENDING") { res.status(400).json({ error: "Can only cash out pending bets" }); return; }
    if (pick.cashedOut) { res.status(400).json({ error: "Already cashed out" }); return; }
    if (new Date(pick.prop.game.gameDate) <= new Date()) {
      res.status(400).json({ error: "Cannot cash out after game has started" }); return;
    }

    await db.update(picks)
      .set({ outcome: "VOID", cashedOut: true })
      .where(eq(picks.id, pick.id));

    await db.update(memberships)
      .set({ balance: sql`${memberships.balance} + ${pick.stake}` })
      .where(and(eq(memberships.userId, pick.userId), eq(memberships.leagueId, pick.leagueId)));

    res.json({ message: "Cashed out", refunded: pick.stake });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Internal helper exported for use in resolution routes
export async function settlePick(pickId: string) {
  const pick = await db.query.picks.findFirst({
    where: eq(picks.id, pickId),
    with: { prop: true },
  }) as any;
  if (!pick || pick.outcome !== "PENDING" || pick.prop.result == null) return;

  const effectiveLine = pick.altLine ?? pick.prop.line;
  const won =
    (pick.direction === "OVER" && pick.prop.result > effectiveLine) ||
    (pick.direction === "UNDER" && pick.prop.result < effectiveLine);

  const profit = won ? calcProfit(pick.stake, pick.odds) : 0;

  await db.update(picks)
    .set({ outcome: won ? "WIN" : "LOSS" })
    .where(eq(picks.id, pick.id));

  if (won) {
    await db.update(memberships)
      .set({
        balance: sql`${memberships.balance} + ${pick.stake + profit}`,
        weeklyWinnings: sql`${memberships.weeklyWinnings} + ${profit}`,
      })
      .where(and(eq(memberships.userId, pick.userId), eq(memberships.leagueId, pick.leagueId)));
  } else {
    await db.update(memberships)
      .set({ weeklyWinnings: sql`${memberships.weeklyWinnings} - ${pick.stake}` })
      .where(and(eq(memberships.userId, pick.userId), eq(memberships.leagueId, pick.leagueId)));
  }
}

export default router;
