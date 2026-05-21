import { Router } from "express";
import { prisma } from "../db/prisma";
import { requireAuth } from "../middleware/auth";
import { getNearestTuesdayNoon } from "../services/scheduleMatchups";

const router = Router();

function generateInviteCode(): string {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

function nextSmallestPowerOf2(n: number): number {
  return Math.pow(2, Math.floor(Math.log2(n - 1)));
}

router.post("/", requireAuth, async (req: any, res: any) => {
  try {
    const { name, weeklyAllowance, maxPlayers, isPublic, maxPublicPlayers, maxBetsPerWeek, maxStakePerBet } = req.body;
    if (!name || !weeklyAllowance || Number(weeklyAllowance) <= 0 || Number(weeklyAllowance) > 1000000) {
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

    const firstUnresolved = await prisma.week.findFirst({
      where: { resolved: false },
      orderBy: { number: "asc" },
    });
    const sw = firstUnresolved ? firstUnresolved.number : 1;

    const rsw = Math.max(1, 18 - sw - pw + 1);

    let inviteCode = generateInviteCode();
    while (await prisma.league.findUnique({ where: { inviteCode } })) {
      inviteCode = generateInviteCode();
    }

    const autoStartAt = getNearestTuesdayNoon(new Date());

    const league = await prisma.league.create({
      data: {
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
        autoStartAt,
      },
    });

    res.status(201).json(league);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Commissioner updates settings (only before season starts)
// Accepts any playoff size ≥ 2 (non-power-of-2 handled by bye bracket system)
router.patch("/:id", requireAuth, async (req: any, res: any) => {
  try {
    const league = await prisma.league.findUnique({ where: { id: req.params.id } });
    if (!league) { res.status(404).json({ error: "League not found" }); return; }
    if (league.creatorId !== req.userId) { res.status(403).json({ error: "Commissioner only" }); return; }
    if (league.seasonStarted) { res.status(400).json({ error: "Cannot change settings after season has started" }); return; }

    const { name, weeklyAllowance, startWeek, regularSeasonWeeks, playoffSize, consolationWeeks, isPublic, maxPublicPlayers } = req.body;

    if (name !== undefined) {
      const trimmed = String(name).trim();
      if (!trimmed) { res.status(400).json({ error: "League name cannot be empty" }); return; }
    }
    if (weeklyAllowance !== undefined) {
      const wa = Number(weeklyAllowance);
      if (wa <= 0 || wa > 1000000) { res.status(400).json({ error: "Weekly allowance must be between $1 and $1,000,000" }); return; }
    }

    const sw = startWeek !== undefined ? Number(startWeek) : league.startWeek;
    const rsw = regularSeasonWeeks !== undefined ? Number(regularSeasonWeeks) : league.regularSeasonWeeks;
    const ps = playoffSize !== undefined ? Number(playoffSize) : league.playoffSize;
    const cw = consolationWeeks !== undefined ? Number(consolationWeeks) : league.consolationWeeks;

    if (sw < 1 || sw > 17) {
      res.status(400).json({ error: "Start week must be between 1 and 17" }); return;
    }
    if (rsw < 1) {
      res.status(400).json({ error: "Regular season must have at least 1 week" }); return;
    }
    if (ps < 2 || ps >= league.maxPlayers) {
      res.status(400).json({ error: `Playoff teams must be between 2 and ${league.maxPlayers - 1}` }); return;
    }

    const pw = Math.ceil(Math.log2(ps));
    const endWeek = sw + rsw + pw - 1;
    if (endWeek > 18) {
      res.status(400).json({ error: `Season would end on NFL week ${endWeek}, which exceeds week 18` }); return;
    }

    const updated = await prisma.league.update({
      where: { id: req.params.id },
      data: {
        ...(name !== undefined ? { name: String(name).trim() } : {}),
        ...(weeklyAllowance !== undefined ? { weeklyAllowance: Number(weeklyAllowance) } : {}),
        ...(isPublic !== undefined
          ? { isPublic: Boolean(isPublic), maxPublicPlayers: Boolean(isPublic) ? 0 : Math.max(0, Number(maxPublicPlayers ?? league.maxPublicPlayers)) }
          : maxPublicPlayers !== undefined
          ? { maxPublicPlayers: Math.max(0, Number(maxPublicPlayers)) }
          : {}),
        startWeek: sw,
        regularSeasonWeeks: rsw,
        playoffWeeks: pw,
        playoffSize: ps,
        consolationTeams: league.maxPlayers - ps,
        consolationWeeks: cw,
      },
    });

    res.json(updated);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.patch("/:id/limits", requireAuth, async (req: any, res: any) => {
  try {
    const league = await prisma.league.findUnique({ where: { id: req.params.id } });
    if (!league) { res.status(404).json({ error: "League not found" }); return; }
    if (league.creatorId !== req.userId) { res.status(403).json({ error: "Commissioner only" }); return; }

    const { maxStakePerBet, maxBetsPerWeek, maxParlayLegs, feedVisibility } = req.body;
    const updated = await prisma.league.update({
      where: { id: req.params.id },
      data: {
        maxStakePerBet: maxStakePerBet === "" || maxStakePerBet == null ? null : Number(maxStakePerBet),
        maxBetsPerWeek: maxBetsPerWeek === "" || maxBetsPerWeek == null ? null : Number(maxBetsPerWeek),
        maxParlayLegs: maxParlayLegs === "" || maxParlayLegs == null ? null : Number(maxParlayLegs),
        ...(feedVisibility === "AFTER_KICKOFF" || feedVisibility === "AFTER_RESOLVE" ? { feedVisibility } : {}),
      },
    });
    res.json(updated);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/by-code/:code", requireAuth, async (req: any, res: any) => {
  try {
    const league = await prisma.league.findUnique({
      where: { inviteCode: req.params.code.toUpperCase() },
    });
    if (!league) { res.status(404).json({ error: "Invalid invite code" }); return; }
    res.json(league);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/:id", requireAuth, async (req: any, res: any) => {
  try {
    const league = await prisma.league.findUnique({ where: { id: req.params.id } });
    if (!league) { res.status(404).json({ error: "League not found" }); return; }
    res.json(league);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Admin can always delete; commissioner can only delete if they're the sole member
router.delete("/:id", requireAuth, async (req: any, res: any) => {
  try {
    const league = await prisma.league.findUnique({ where: { id: req.params.id } });
    if (!league) { res.status(404).json({ error: "League not found" }); return; }

    const isAdminUser = req.isAdmin;
    const isCreator = league.creatorId === req.userId;

    if (!isAdminUser && !isCreator) {
      res.status(403).json({ error: "Only the commissioner or an admin can delete a league" }); return;
    }

    if (!isAdminUser) {
      const memberCount = await prisma.membership.count({ where: { leagueId: req.params.id } });
      if (memberCount > 1) {
        res.status(400).json({ error: "Cannot delete a league with other members" }); return;
      }
    }

    const parlays = await prisma.parlay.findMany({ where: { leagueId: req.params.id }, select: { id: true } });
    const parlayIds = parlays.map((p) => p.id);

    await prisma.parlayLeg.deleteMany({ where: { parlayId: { in: parlayIds } } });
    await prisma.parlay.deleteMany({ where: { leagueId: req.params.id } });
    await prisma.gamePick.deleteMany({ where: { leagueId: req.params.id } });
    await prisma.pick.deleteMany({ where: { leagueId: req.params.id } });
    await prisma.matchup.deleteMany({ where: { leagueId: req.params.id } });
    await prisma.membership.deleteMany({ where: { leagueId: req.params.id } });
    await prisma.league.delete({ where: { id: req.params.id } });

    res.json({ message: "League deleted" });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
