import { Router } from "express";
import { db } from "../db/db";
import { eq, and } from "drizzle-orm";
import { picks, leagues, props } from "../db/schema";
import { WEEK_WITHOUT_BOARD } from "../db/weekColumns";
import { requireAuth } from "../middleware/auth";
import { betLimiter } from "../middleware/rateLimit";
import { fmtMoney } from "../lib/payout";
import { altOddsFor } from "../services/propOdds";
import { lockMembership, debitStake, creditStake, countWeekBets } from "../services/betLedger";
import { HttpError } from "../middleware/errorHandler";

const router = Router();


router.post("/", requireAuth, betLimiter, async (req: any, res: any, next: any) => {
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
      with: { game: { with: { week: WEEK_WITHOUT_BOARD } } },
    }) as any;

    if (!prop) { res.status(404).json({ error: "Prop not found" }); return; }
    if (prop.game.status === "CANCELLED") { res.status(400).json({ error: "This game has been cancelled" }); return; }
    if (prop.game.week.locked) { res.status(400).json({ error: "This week is locked" }); return; }
    if (prop.game.week.resolved) { res.status(400).json({ error: "This week is already resolved" }); return; }

    // Per-game kickoff lock
    if (new Date(prop.game.gameDate) <= new Date()) {
      res.status(400).json({ error: "This game has already kicked off — bets are locked" }); return;
    }

    // One transaction, holding a lock on the member, so concurrent bets see
    // each other's debits and counts. See services/betLedger.ts.
    const pick = await db.transaction(async (tx) => {
      const membership = await lockMembership(tx, userId, leagueId);
      if (membership.balance < Number(stake)) throw new HttpError(400, "Insufficient balance");

      // Rule 2: cannot bet opposite direction while a pending pick exists on same prop
      const oppositeDir = direction === "OVER" ? "UNDER" : "OVER";
      const pendingOpposite = await tx.query.picks.findFirst({
        where: and(
          eq(picks.userId, userId),
          eq(picks.leagueId, leagueId),
          eq(picks.propId, propId),
          eq(picks.direction, oppositeDir as any),
          eq(picks.outcome, "PENDING"),
        ),
      });
      if (pendingOpposite) throw new HttpError(409, "You have an active bet on the opposite side — cash out first");

      const [league] = await tx.select({
        maxStakePerBet: leagues.maxStakePerBet,
        maxBetsPerWeek: leagues.maxBetsPerWeek,
      }).from(leagues).where(eq(leagues.id, leagueId)).limit(1);

      if (league?.maxStakePerBet && Number(stake) > league.maxStakePerBet) {
        throw new HttpError(400, `Max stake per bet is ${fmtMoney(league.maxStakePerBet)}`);
      }
      if (league?.maxBetsPerWeek) {
        const weekBets = await countWeekBets(tx, userId, leagueId, prop.game.weekId);
        if (weekBets >= league.maxBetsPerWeek) {
          throw new HttpError(400, `Maximum ${league.maxBetsPerWeek} bets per week`);
        }
      }

      const effectiveOdds = altOddsFor(prop, altLine != null ? Number(altLine) : null, direction);

      const [created] = await tx.insert(picks).values({
        userId, leagueId, propId, direction, stake: Number(stake),
        odds: effectiveOdds,
        altLine: altLine != null ? Number(altLine) : null,
      }).returning();

      await debitStake(tx, userId, leagueId, Number(stake));
      return created;
    });

    res.status(201).json(pick);
  } catch (err: any) {
    next(err); return;
  }
});

router.get("/", requireAuth, async (req: any, res: any, next: any) => {
  try {
    const { leagueId } = req.query;

    const whereClause = leagueId
      ? and(eq(picks.userId, req.userId), eq(picks.leagueId, String(leagueId)))
      : eq(picks.userId, req.userId);

    const rows = await db.query.picks.findMany({
      where: whereClause,
      with: { prop: { with: { player: true, game: { with: { week: WEEK_WITHOUT_BOARD } } } } },
      orderBy: (picks, { desc }) => [desc(picks.createdAt)],
    });

    res.json(rows);
  } catch (err: any) {
    next(err); return;
  }
});

// Cashout a pending prop pick before kickoff — full stake refund
router.post("/:id/cashout", requireAuth, betLimiter, async (req: any, res: any, next: any) => {
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

    // The PENDING/cashedOut checks above are a fast path for a clear answer;
    // this conditional UPDATE is the guard. Two concurrent cashouts both pass
    // the read, but only one can flip the row, so the stake is refunded once.
    await db.transaction(async (tx) => {
      const claimed = await tx.update(picks)
        .set({ outcome: "VOID", cashedOut: true })
        .where(and(eq(picks.id, pick.id), eq(picks.outcome, "PENDING"), eq(picks.cashedOut, false)))
        .returning({ id: picks.id });
      if (claimed.length === 0) throw new HttpError(400, "Already cashed out");

      await creditStake(tx, pick.userId, pick.leagueId, pick.stake);
    });

    res.json({ message: "Cashed out", refunded: pick.stake });
  } catch (err: any) {
    next(err); return;
  }
});

export default router;
