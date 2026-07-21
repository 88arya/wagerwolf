import { Router } from "express";
import { db } from "../db/db";
import { eq, and, inArray, count, sql } from "drizzle-orm";
import { leagues, memberships, weeks, parlays, parlayLegs, gamePicks, picks, matchups } from "../db/schema";
import { requireAuth } from "../middleware/auth";
import { getNearestTuesdayNoon } from "../services/scheduleMatchups";

const MAX_NFL_WEEK = 17;

const router = Router();

function generateInviteCode(): string {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

function nextSmallestPowerOf2(n: number): number {
  return Math.pow(2, Math.floor(Math.log2(n - 1)));
}

router.post("/", requireAuth, async (req: any, res: any) => {
  try {
    const { name, weeklyAllowance, maxPlayers, isPublic, maxPublicPlayers, maxBetsPerWeek, maxStakePerBet, startWeek } = req.body;
    // weeklyAllowance is in cents ($1,000,000 = 100,000,000 cents)
    if (!name || !weeklyAllowance || Number(weeklyAllowance) <= 0 || Number(weeklyAllowance) > 100000000) {
      res.status(400).json({ error: "Weekly allowance must be between $1 and $1,000,000" });
      return;
    }

    const mp = Number(maxPlayers ?? 10);
    if (mp < 2 || mp > 20) {
      res.status(400).json({ error: "Number of players must be between 2 and 20" });
      return;
    }
    if (mp % 2 !== 0) {
      res.status(400).json({ error: "Number of players must be even" });
      return;
    }

    const ps = nextSmallestPowerOf2(mp);
    const pw = Math.ceil(Math.log2(ps));
    const consolationTeams = mp - ps;

    let sw: number;
    if (startWeek !== undefined) {
      sw = Number(startWeek);
      if (sw < 1 || sw > MAX_NFL_WEEK) {
        res.status(400).json({ error: `Start week must be between 1 and ${MAX_NFL_WEEK}` }); return;
      }
    } else {
      const firstUnresolved = await db.query.weeks.findFirst({
        where: eq(weeks.resolved, false),
      });
      sw = firstUnresolved ? firstUnresolved.number : 1;
    }

    const rsw = Math.max(1, MAX_NFL_WEEK - sw - pw + 1);

    let inviteCode = generateInviteCode();
    while (await db.query.leagues.findFirst({ where: eq(leagues.inviteCode, inviteCode) })) {
      inviteCode = generateInviteCode();
    }

    const startWeekRecord = startWeek !== undefined
      ? await db.query.weeks.findFirst({ where: eq(weeks.number, sw) })
      : null;
    const autoStartAt = startWeekRecord
      ? startWeekRecord.startDate
      : Boolean(isPublic) ? getNearestTuesdayNoon(new Date()) : null;

    const [league] = await db.insert(leagues).values({
      name,
      weeklyAllowance: Number(weeklyAllowance),
      inviteCode,
      creatorId: req.userId,
      isPublic: Boolean(isPublic),
      maxPublicPlayers: Boolean(isPublic) ? 0 : Math.max(0, Number(maxPublicPlayers ?? 0)),
      maxBetsPerWeek: maxBetsPerWeek ? Number(maxBetsPerWeek) : null,
      maxStakePerBet: maxStakePerBet ? Number(maxStakePerBet) : null,
      maxPlayers: mp,
      startWeek: sw,
      regularSeasonWeeks: rsw,
      playoffWeeks: pw,
      playoffSize: ps,
      consolationTeams,
      consolationWeeks: 2,
      autoStartAt: autoStartAt ?? undefined,
    }).returning();

    res.status(201).json(league);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Commissioner updates settings (only before season starts)
// Accepts any playoff size ≥ 2 (non-power-of-2 handled by bye bracket system)
router.patch("/:id", requireAuth, async (req: any, res: any) => {
  try {
    const [league] = await db.select().from(leagues).where(eq(leagues.id, req.params.id)).limit(1);
    if (!league) { res.status(404).json({ error: "League not found" }); return; }
    if (league.creatorId !== req.userId) { res.status(403).json({ error: "Commissioner only" }); return; }
    if (league.seasonStarted) { res.status(400).json({ error: "Cannot change settings after season has started" }); return; }

    const { name, weeklyAllowance, startWeek, regularSeasonWeeks, playoffSize, consolationWeeks, isPublic, maxPublicPlayers } = req.body;

    if (name !== undefined) {
      const trimmed = String(name).trim();
      if (!trimmed) { res.status(400).json({ error: "League name cannot be empty" }); return; }
    }
    if (weeklyAllowance !== undefined) {
      const wa = Number(weeklyAllowance); // cents
      if (wa <= 0 || wa > 100000000) { res.status(400).json({ error: "Weekly allowance must be between $1 and $1,000,000" }); return; }
    }

    const sw = startWeek !== undefined ? Number(startWeek) : league.startWeek;
    const rsw = regularSeasonWeeks !== undefined ? Number(regularSeasonWeeks) : league.regularSeasonWeeks;
    const ps = playoffSize !== undefined ? Number(playoffSize) : league.playoffSize;
    const cw = consolationWeeks !== undefined ? Number(consolationWeeks) : league.consolationWeeks;

    if (sw < 1 || sw > MAX_NFL_WEEK) {
      res.status(400).json({ error: `Start week must be between 1 and ${MAX_NFL_WEEK}` }); return;
    }
    if (rsw < 1) {
      res.status(400).json({ error: "Regular season must have at least 1 week" }); return;
    }
    if (ps < 2 || ps >= league.maxPlayers) {
      res.status(400).json({ error: `Playoff teams must be between 2 and ${league.maxPlayers - 1}` }); return;
    }

    const pw = Math.ceil(Math.log2(ps));
    const endWeek = sw + rsw + pw - 1;
    if (endWeek > MAX_NFL_WEEK) {
      res.status(400).json({ error: `Season would end on NFL week ${endWeek}, which exceeds week ${MAX_NFL_WEEK}` }); return;
    }

    let autoStartAt: Date | null | undefined = undefined;
    if (startWeek !== undefined && sw !== league.startWeek) {
      const startWeekRecord = await db.query.weeks.findFirst({ where: eq(weeks.number, sw) });
      autoStartAt = startWeekRecord ? startWeekRecord.startDate : null;
    }

    const updateData: Record<string, any> = {
      startWeek: sw,
      regularSeasonWeeks: rsw,
      playoffWeeks: pw,
      playoffSize: ps,
      consolationTeams: league.maxPlayers - ps,
      consolationWeeks: cw,
    };
    if (name !== undefined) updateData.name = String(name).trim();
    if (weeklyAllowance !== undefined) updateData.weeklyAllowance = Number(weeklyAllowance);
    if (isPublic !== undefined) {
      updateData.isPublic = Boolean(isPublic);
      updateData.maxPublicPlayers = Boolean(isPublic) ? 0 : Math.max(0, Number(maxPublicPlayers ?? league.maxPublicPlayers));
    } else if (maxPublicPlayers !== undefined) {
      updateData.maxPublicPlayers = Math.max(0, Number(maxPublicPlayers));
    }
    if (autoStartAt !== undefined) updateData.autoStartAt = autoStartAt;

    const [updated] = await db.update(leagues).set(updateData).where(eq(leagues.id, req.params.id)).returning();

    res.json(updated);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.patch("/:id/limits", requireAuth, async (req: any, res: any) => {
  try {
    const [league] = await db.select().from(leagues).where(eq(leagues.id, req.params.id)).limit(1);
    if (!league) { res.status(404).json({ error: "League not found" }); return; }
    if (league.creatorId !== req.userId) { res.status(403).json({ error: "Commissioner only" }); return; }

    const { maxStakePerBet, maxBetsPerWeek, maxParlayLegs, feedVisibility } = req.body;

    const updateData: Record<string, any> = {
      maxStakePerBet: maxStakePerBet === "" || maxStakePerBet == null ? null : Number(maxStakePerBet),
      maxBetsPerWeek: maxBetsPerWeek === "" || maxBetsPerWeek == null ? null : Number(maxBetsPerWeek),
      maxParlayLegs: maxParlayLegs === "" || maxParlayLegs == null ? null : Number(maxParlayLegs),
    };
    if (feedVisibility === "AFTER_KICKOFF" || feedVisibility === "AFTER_RESOLVE") {
      updateData.feedVisibility = feedVisibility;
    }

    const [updated] = await db.update(leagues).set(updateData).where(eq(leagues.id, req.params.id)).returning();
    res.json(updated);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/by-code/:code", requireAuth, async (req: any, res: any) => {
  try {
    const [league] = await db.select().from(leagues)
      .where(eq(leagues.inviteCode, req.params.code.toUpperCase()))
      .limit(1);
    if (!league) { res.status(404).json({ error: "Invalid invite code" }); return; }
    res.json(league);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/:id", requireAuth, async (req: any, res: any) => {
  try {
    const [league] = await db.select().from(leagues).where(eq(leagues.id, req.params.id)).limit(1);
    if (!league) { res.status(404).json({ error: "League not found" }); return; }
    res.json(league);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.delete("/:id", requireAuth, async (req: any, res: any) => {
  try {
    const [league] = await db.select().from(leagues).where(eq(leagues.id, req.params.id)).limit(1);
    if (!league) { res.status(404).json({ error: "League not found" }); return; }

    if (league.creatorId !== req.userId) {
      res.status(403).json({ error: "Only the commissioner can delete a league" }); return;
    }

    const [{ value: memberCount }] = await db.select({ value: count() })
      .from(memberships)
      .where(eq(memberships.leagueId, req.params.id));
    if (memberCount > 1) {
      res.status(400).json({ error: "Cannot delete a league with other members" }); return;
    }

    const leagueParlays = await db.select({ id: parlays.id })
      .from(parlays)
      .where(eq(parlays.leagueId, req.params.id));
    const parlayIds = leagueParlays.map((p) => p.id);

    if (parlayIds.length > 0) {
      await db.delete(parlayLegs).where(inArray(parlayLegs.parlayId, parlayIds));
    }
    await db.delete(parlays).where(eq(parlays.leagueId, req.params.id));
    await db.delete(gamePicks).where(eq(gamePicks.leagueId, req.params.id));
    await db.delete(picks).where(eq(picks.leagueId, req.params.id));
    await db.delete(matchups).where(eq(matchups.leagueId, req.params.id));
    await db.delete(memberships).where(eq(memberships.leagueId, req.params.id));
    await db.delete(leagues).where(eq(leagues.id, req.params.id));

    res.json({ message: "League deleted" });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
