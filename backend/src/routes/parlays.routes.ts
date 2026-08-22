import { Router } from "express";
import { db } from "../db/db";
import { eq, and, inArray, sql } from "drizzle-orm";
import { leagues, memberships, weeks, games, props, picks, gameLines, gamePicks, parlays, parlayLegs } from "../db/schema";
import { requireAuth } from "../middleware/auth";
import { betLimiter } from "../middleware/rateLimit";
import { calcParlayOdds, calcParlayPayout, fmtMoney } from "../lib/payout";
import { findFirstConflict, conflictMessage, type ConflictLeg } from "../services/betConflicts";
import { altOddsFor } from "../services/propOdds";

const router = Router();

function getCombinations<T>(arr: T[], size: number): T[][] {
  if (size === 0) return [[]];
  if (arr.length < size) return [];
  const [first, ...rest] = arr;
  return [
    ...getCombinations(rest, size - 1).map((c) => [first, ...c]),
    ...getCombinations(rest, size),
  ];
}

interface ResolvedLeg {
  propId?: string;
  gameLineId?: string;
  direction?: string;
  odds: number;
  altLine?: number;
  gameId: string;
  market?: string;
  // Carried so each combo can be checked with the shared conflict model.
  line?: number | null;
  statType?: string | null;
  playerId?: string | null;
}

/** A resolved round-robin leg in the shape the conflict model expects. */
function toConflictLeg(leg: ResolvedLeg): ConflictLeg {
  return leg.propId
    ? {
        type: "prop", id: leg.propId, direction: leg.direction,
        line: leg.line, altLine: leg.altLine, statType: leg.statType,
        playerId: leg.playerId, gameId: leg.gameId,
      }
    : {
        type: "gameline", id: leg.gameLineId!, market: leg.market,
        line: leg.line, altLine: leg.altLine, gameId: leg.gameId,
      };
}

// Opposing-side / redundant-leg detection lives in services/betConflicts.ts so
// the line values and the favoured side are actually taken into account. See
// that file for the model.


function calcGameLineAltOdds(baseOdds: number, baseLine: number, altLine: number, market: string): number {
  const steps = (altLine - baseLine) / 0.5;
  const favSteps = market === "TOTAL_OVER" ? -steps : steps;
  return Math.max(-500, Math.min(500, baseOdds - Math.round(favSteps * 15)));
}

interface LegInput {
  propId?: string;
  gameLineId?: string;
  direction?: "OVER" | "UNDER";
  altLine?: number;
}

// Helper: count bets for a user+league scoped to a specific weekId
async function countWeekBets(userId: string, leagueId: string, weekId: string): Promise<number> {
  // picks: join prop → game where game.weekId = weekId
  const weekPickRows = await db
    .select({ id: picks.id })
    .from(picks)
    .innerJoin(props, eq(picks.propId, props.id))
    .innerJoin(games, eq(props.gameId, games.id))
    .where(and(eq(picks.userId, userId), eq(picks.leagueId, leagueId), eq(games.weekId, weekId)));

  // gamePicks: join gameLine → game where game.weekId = weekId
  const weekGamePickRows = await db
    .select({ id: gamePicks.id })
    .from(gamePicks)
    .innerJoin(gameLines, eq(gamePicks.gameLineId, gameLines.id))
    .innerJoin(games, eq(gameLines.gameId, games.id))
    .where(and(eq(gamePicks.userId, userId), eq(gamePicks.leagueId, leagueId), eq(games.weekId, weekId)));

  // parlays: a parlay counts if it has at least one leg touching this week
  // find parlayIds for this user+league, then check if any of their legs touch this week
  const userParlayRows = await db
    .select({ id: parlays.id })
    .from(parlays)
    .where(and(eq(parlays.userId, userId), eq(parlays.leagueId, leagueId)));

  let weekParlayCount = 0;
  if (userParlayRows.length > 0) {
    const parlayIds = userParlayRows.map((p) => p.id);
    // legs via props
    const legViaPropRows = await db
      .select({ parlayId: parlayLegs.parlayId })
      .from(parlayLegs)
      .innerJoin(props, eq(parlayLegs.propId, props.id))
      .innerJoin(games, eq(props.gameId, games.id))
      .where(and(inArray(parlayLegs.parlayId, parlayIds), eq(games.weekId, weekId)));
    // legs via gameLines
    const legViaGLRows = await db
      .select({ parlayId: parlayLegs.parlayId })
      .from(parlayLegs)
      .innerJoin(gameLines, eq(parlayLegs.gameLineId, gameLines.id))
      .innerJoin(games, eq(gameLines.gameId, games.id))
      .where(and(inArray(parlayLegs.parlayId, parlayIds), eq(games.weekId, weekId)));

    const touchingParlayIds = new Set<string>();
    for (const r of legViaPropRows) touchingParlayIds.add(r.parlayId);
    for (const r of legViaGLRows) touchingParlayIds.add(r.parlayId);
    weekParlayCount = touchingParlayIds.size;
  }

  return weekPickRows.length + weekGamePickRows.length + weekParlayCount;
}

router.post("/", requireAuth, betLimiter, async (req: any, res: any) => {
  try {
    const { leagueId, stake, legs } = req.body as {
      leagueId: string;
      stake: number;
      legs: LegInput[];
    };
    const userId = req.userId;

    if (!leagueId || !stake || !legs || legs.length < 2) {
      res.status(400).json({ error: "leagueId, stake, and at least 2 legs are required" });
      return;
    }
    if (Number(stake) <= 0 || !Number.isInteger(Number(stake))) {
      res.status(400).json({ error: "Stake must be a whole number of cents greater than 0" });
      return;
    }

    const [league] = await db
      .select({ maxStakePerBet: leagues.maxStakePerBet, maxBetsPerWeek: leagues.maxBetsPerWeek, maxParlayLegs: leagues.maxParlayLegs })
      .from(leagues)
      .where(eq(leagues.id, leagueId))
      .limit(1);

    if (league?.maxParlayLegs && legs.length > league.maxParlayLegs) {
      res.status(400).json({ error: `Maximum ${league.maxParlayLegs} legs per parlay` }); return;
    }
    if (league?.maxStakePerBet && Number(stake) > league.maxStakePerBet) {
      res.status(400).json({ error: `Max stake per bet is ${fmtMoney(league.maxStakePerBet)}` }); return;
    }

    const [membership] = await db
      .select()
      .from(memberships)
      .where(and(eq(memberships.userId, userId), eq(memberships.leagueId, leagueId)))
      .limit(1);
    if (!membership) { res.status(404).json({ error: "Not a member of this league" }); return; }
    if (membership.balance < Number(stake)) {
      res.status(400).json({ error: "Insufficient balance" });
      return;
    }

    // Validate each leg and collect odds
    const resolvedLegs: Array<{ propId?: string; gameLineId?: string; direction?: string; odds: number; altLine?: number }> = [];
    const seenGameLineIds = new Set<string>();
    const conflictLegs: ConflictLeg[] = [];
    let firstWeekId: string | null = null;

    for (const leg of legs) {
      if (!leg.propId && !leg.gameLineId) {
        res.status(400).json({ error: "Each leg must have propId or gameLineId" });
        return;
      }

      if (leg.propId) {
        if (!leg.direction) { res.status(400).json({ error: "Prop legs require a direction" }); return; }

        const prop = await db.query.props.findFirst({
          where: eq(props.id, leg.propId),
          with: { game: { with: { week: true } } },
        }) as any;
        if (!prop) { res.status(404).json({ error: `Prop ${leg.propId} not found` }); return; }
        if (prop.game.status === "CANCELLED") { res.status(400).json({ error: "Cannot include bets on cancelled games in parlay" }); return; }
        if (prop.game.week.locked || prop.game.week.resolved) {
          res.status(400).json({ error: "Cannot include locked/resolved props in parlay" });
          return;
        }
        if (new Date(prop.game.gameDate) <= new Date()) {
          res.status(400).json({ error: `Game has already kicked off — cannot include in parlay` }); return;
        }

        conflictLegs.push({
          type: "prop", id: leg.propId, direction: leg.direction,
          line: prop.line, altLine: leg.altLine, statType: prop.statType,
          playerId: prop.playerId, gameId: prop.gameId,
        });
        if (!firstWeekId) firstWeekId = prop.game.week.id;

        const propOdds = altOddsFor(prop, leg.altLine, leg.direction!);
        resolvedLegs.push({ propId: leg.propId, direction: leg.direction, odds: propOdds, altLine: leg.altLine });
      } else if (leg.gameLineId) {
        const gameLine = await db.query.gameLines.findFirst({
          where: eq(gameLines.id, leg.gameLineId),
          with: { game: { with: { week: true } } },
        }) as any;
        if (!gameLine) { res.status(404).json({ error: `GameLine ${leg.gameLineId} not found` }); return; }
        if (gameLine.game.status === "CANCELLED") { res.status(400).json({ error: "Cannot include bets on cancelled games in parlay" }); return; }
        if (gameLine.game.week.locked || gameLine.game.week.resolved) {
          res.status(400).json({ error: "Cannot include locked/resolved game lines in parlay" });
          return;
        }
        if (new Date(gameLine.game.gameDate) <= new Date()) {
          res.status(400).json({ error: `Game has already kicked off — cannot include in parlay` }); return;
        }

        if (seenGameLineIds.has(leg.gameLineId)) {
          res.status(409).json({ error: "Duplicate game line in parlay" });
          return;
        }

        conflictLegs.push({
          type: "gameline", id: leg.gameLineId, market: gameLine.market,
          line: gameLine.line, altLine: leg.altLine, gameId: gameLine.gameId,
        });
        seenGameLineIds.add(leg.gameLineId);
        if (!firstWeekId) firstWeekId = gameLine.game.week.id;

        if (leg.altLine != null && gameLine.market.startsWith("MONEYLINE")) {
          res.status(400).json({ error: "Cannot rotate line on moneylines" }); return;
        }
        const glOdds = (leg.altLine != null && gameLine.line != null)
          ? calcGameLineAltOdds(gameLine.odds, gameLine.line, leg.altLine, gameLine.market)
          : gameLine.odds;
        resolvedLegs.push({ gameLineId: leg.gameLineId, odds: glOdds, altLine: leg.altLine });
      }
    }

    // Contradictory, redundant and duplicate legs, in one pass over the set.
    const conflict = findFirstConflict(conflictLegs);
    if (conflict) {
      res.status(409).json({ error: conflictMessage(conflict.a, conflict.b, conflict.kind) });
      return;
    }

    if (league?.maxBetsPerWeek && firstWeekId) {
      const totalWeekBets = await countWeekBets(userId, leagueId, firstWeekId);
      if (totalWeekBets >= league.maxBetsPerWeek) {
        res.status(400).json({ error: `Maximum ${league.maxBetsPerWeek} bets per week` }); return;
      }
    }

    const totalOdds = calcParlayOdds(resolvedLegs.map((l) => l.odds));
    const payout = calcParlayPayout(Number(stake), totalOdds);

    const parlay = await db.transaction(async (tx) => {
      const [created] = await tx.insert(parlays).values({
        userId,
        leagueId,
        stake: Number(stake),
        totalOdds,
        payout,
      }).returning();

      const legRows = resolvedLegs.map((l) => ({
        parlayId: created.id,
        propId: l.propId ?? null,
        gameLineId: l.gameLineId ?? null,
        direction: (l.direction as any) ?? null,
        odds: l.odds,
        altLine: l.altLine ?? null,
      }));
      const createdLegs = await tx.insert(parlayLegs).values(legRows).returning();

      await tx
        .update(memberships)
        .set({ balance: sql`${memberships.balance} - ${Number(stake)}` })
        .where(and(eq(memberships.userId, userId), eq(memberships.leagueId, leagueId)));

      return { ...created, legs: createdLegs };
    });

    res.status(201).json(parlay);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/round-robin", requireAuth, betLimiter, async (req: any, res: any) => {
  try {
    const { leagueId, legs, size, stakePerParlay } = req.body as {
      leagueId: string; legs: LegInput[]; size: number; stakePerParlay: number;
    };
    const userId = req.userId;

    if (!leagueId || !Array.isArray(legs) || legs.length < 3 || !size || size < 2 || size >= legs.length || !stakePerParlay) {
      res.status(400).json({ error: "Requires leagueId, 3+ legs, size (2 to legs-1), and stakePerParlay" }); return;
    }

    const [league] = await db
      .select({ maxStakePerBet: leagues.maxStakePerBet, maxBetsPerWeek: leagues.maxBetsPerWeek, maxParlayLegs: leagues.maxParlayLegs })
      .from(leagues)
      .where(eq(leagues.id, leagueId))
      .limit(1);
    if (league?.maxStakePerBet && Number(stakePerParlay) > league.maxStakePerBet) {
      res.status(400).json({ error: `Max stake per bet is ${fmtMoney(league.maxStakePerBet)}` }); return;
    }

    const [membership] = await db
      .select()
      .from(memberships)
      .where(and(eq(memberships.userId, userId), eq(memberships.leagueId, leagueId)))
      .limit(1);
    if (!membership) { res.status(404).json({ error: "Not a member of this league" }); return; }

    // Resolve every leg individually (validate + compute odds)
    const resolved: ResolvedLeg[] = [];
    let firstWeekId: string | null = null;
    for (const leg of legs) {
      if (!leg.propId && !leg.gameLineId) {
        res.status(400).json({ error: "Each leg must have propId or gameLineId" }); return;
      }
      if (leg.propId) {
        if (!leg.direction) { res.status(400).json({ error: "Prop legs require a direction" }); return; }
        const prop = await db.query.props.findFirst({
          where: eq(props.id, leg.propId),
          with: { game: { with: { week: true } } },
        }) as any;
        if (!prop) { res.status(404).json({ error: `Prop ${leg.propId} not found` }); return; }
        if (prop.game.status === "CANCELLED") { res.status(400).json({ error: "Cannot include cancelled game" }); return; }
        if (prop.game.week.locked || prop.game.week.resolved) { res.status(400).json({ error: "Cannot include locked/resolved props" }); return; }
        if (new Date(prop.game.gameDate) <= new Date()) { res.status(400).json({ error: "Game has already kicked off" }); return; }
        const odds = altOddsFor(prop, leg.altLine, leg.direction!);
        if (!firstWeekId) firstWeekId = prop.game.week.id;
        resolved.push({
          propId: leg.propId, direction: leg.direction, odds, altLine: leg.altLine,
          gameId: prop.game.id, line: prop.line, statType: prop.statType, playerId: prop.playerId,
        });
      } else if (leg.gameLineId) {
        const gameLine = await db.query.gameLines.findFirst({
          where: eq(gameLines.id, leg.gameLineId),
          with: { game: { with: { week: true } } },
        }) as any;
        if (!gameLine) { res.status(404).json({ error: `GameLine ${leg.gameLineId} not found` }); return; }
        if (gameLine.game.status === "CANCELLED") { res.status(400).json({ error: "Cannot include cancelled game" }); return; }
        if (gameLine.game.week.locked || gameLine.game.week.resolved) { res.status(400).json({ error: "Cannot include locked/resolved game lines" }); return; }
        if (new Date(gameLine.game.gameDate) <= new Date()) { res.status(400).json({ error: "Game has already kicked off" }); return; }
        if (leg.altLine != null && gameLine.market.startsWith("MONEYLINE")) { res.status(400).json({ error: "Cannot rotate moneyline" }); return; }
        const odds = leg.altLine != null && gameLine.line != null
          ? calcGameLineAltOdds(gameLine.odds, gameLine.line, leg.altLine, gameLine.market)
          : gameLine.odds;
        if (!firstWeekId) firstWeekId = gameLine.game.week.id;
        resolved.push({
          gameLineId: leg.gameLineId, odds, altLine: leg.altLine,
          gameId: gameLine.game.id, market: gameLine.market, line: gameLine.line,
        });
      }
    }

    const combos = getCombinations(resolved, size);
    const totalStake = Number(stakePerParlay) * combos.length;

    if (membership.balance < totalStake) {
      res.status(400).json({ error: `Insufficient balance — need $${totalStake} for ${combos.length} combos` }); return;
    }

    // Validate each combo for internal conflicts. Checked per combo rather than
    // over the whole set: two legs that clash may never land in the same combo,
    // and only the combos that actually pair them are unplaceable.
    for (const combo of combos) {
      const conflict = findFirstConflict(combo.map(toConflictLeg));
      if (conflict) {
        res.status(409).json({ error: conflictMessage(conflict.a, conflict.b, conflict.kind) });
        return;
      }
    }

    if (league?.maxBetsPerWeek && firstWeekId) {
      const totalWeekBets = await countWeekBets(userId, leagueId, firstWeekId);
      if (totalWeekBets + combos.length > league.maxBetsPerWeek) {
        res.status(400).json({ error: `Would exceed max ${league.maxBetsPerWeek} bets per week` }); return;
      }
    }

    const createdParlays = await db.transaction(async (tx) => {
      const created = [];
      for (const combo of combos) {
        const totalOdds = calcParlayOdds(combo.map((l) => l.odds));
        const payout = calcParlayPayout(Number(stakePerParlay), totalOdds);
        const [parlay] = await tx.insert(parlays).values({
          userId, leagueId,
          stake: Number(stakePerParlay),
          totalOdds, payout,
        }).returning();

        const legRows = combo.map((l) => ({
          parlayId: parlay.id,
          propId: l.propId ?? null,
          gameLineId: l.gameLineId ?? null,
          direction: (l.direction as any) ?? null,
          odds: l.odds,
          altLine: l.altLine ?? null,
        }));
        const createdLegs = await tx.insert(parlayLegs).values(legRows).returning();
        created.push({ ...parlay, legs: createdLegs });
      }
      await tx
        .update(memberships)
        .set({ balance: sql`${memberships.balance} - ${totalStake}` })
        .where(and(eq(memberships.userId, userId), eq(memberships.leagueId, leagueId)));
      return created;
    });

    res.status(201).json({ parlays: createdParlays, combos: createdParlays.length, totalStake });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Cashout a pending parlay before all games have started — full stake refund
router.post("/:id/cashout", requireAuth, betLimiter, async (req: any, res: any) => {
  try {
    const parlay = await db.query.parlays.findFirst({
      where: eq(parlays.id, req.params.id),
      with: {
        legs: {
          with: {
            prop: { with: { game: true } },
            gameLine: { with: { game: true } },
          },
        },
      },
    }) as any;

    if (!parlay) { res.status(404).json({ error: "Parlay not found" }); return; }
    if (parlay.userId !== req.userId) { res.status(403).json({ error: "Not your parlay" }); return; }
    if (parlay.outcome !== "PENDING") { res.status(400).json({ error: "Can only cash out pending parlays" }); return; }
    if (parlay.cashedOut) { res.status(400).json({ error: "Already cashed out" }); return; }

    // Cashout only if every leg's game hasn't started
    const now = new Date();
    for (const leg of parlay.legs) {
      const game = leg.prop?.game ?? leg.gameLine?.game;
      if (game && new Date(game.gameDate) <= now) {
        res.status(400).json({ error: "Cannot cash out — one or more games have already started" }); return;
      }
    }

    await db.transaction(async (tx) => {
      await tx
        .update(parlays)
        .set({ outcome: "VOID", cashedOut: true })
        .where(eq(parlays.id, parlay.id));
      await tx
        .update(memberships)
        .set({ balance: sql`${memberships.balance} + ${parlay.stake}` })
        .where(and(eq(memberships.userId, parlay.userId), eq(memberships.leagueId, parlay.leagueId)));
    });

    res.json({ message: "Cashed out", refunded: parlay.stake });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/", requireAuth, async (req: any, res: any) => {
  try {
    const { leagueId } = req.query;

    const rows = await db.query.parlays.findMany({
      where: leagueId
        ? and(eq(parlays.userId, req.userId), eq(parlays.leagueId, String(leagueId)))
        : eq(parlays.userId, req.userId),
      with: {
        legs: {
          with: {
            prop: { with: { player: true, game: { with: { week: true } } } },
            gameLine: { with: { game: { with: { week: true } } } },
          },
        },
      },
      orderBy: (parlays, { desc }) => [desc(parlays.createdAt)],
    });

    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
