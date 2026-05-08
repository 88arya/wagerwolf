import { Router } from "express";
import { prisma } from "../db/prisma";
import { requireAuth, requireAdmin } from "../middleware/auth";

const router = Router();

function generateInviteCode(): string {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

// Largest power of 2 strictly less than n (e.g. 10→8, 8→4, 4→2)
function nextSmallestPowerOf2(n: number): number {
  return Math.pow(2, Math.floor(Math.log2(n - 1)));
}

router.post("/", requireAuth, async (req: any, res: any) => {
  try {
    const { name, weeklyAllowance, maxTeams } = req.body;
    if (!name || !weeklyAllowance || Number(weeklyAllowance) <= 0) {
      res.status(400).json({ error: "Name and a positive weekly allowance are required" });
      return;
    }

    const mt = Number(maxTeams ?? 10);
    if (mt < 4 || mt > 20 || mt % 2 !== 0) {
      res.status(400).json({ error: "Number of teams must be an even number between 4 and 20" });
      return;
    }

    const ps = nextSmallestPowerOf2(mt);
    const pw = Math.log2(ps);
    const consolationTeams = mt - ps;
    const consolationWeeks = 2;

    // Default startWeek: first unresolved NFL week; if week 1 is live use week 2; offseason → week 1
    const firstUnresolved = await prisma.week.findFirst({
      where: { resolved: false },
      orderBy: { number: "asc" },
    });
    let sw = 1;
    if (firstUnresolved) {
      sw = firstUnresolved.number === 1 ? 2 : firstUnresolved.number;
    }

    // Fill up to NFL week 18 by default
    const rsw = Math.max(1, 18 - sw - pw + 1);

    let inviteCode = generateInviteCode();
    while (await prisma.league.findUnique({ where: { inviteCode } })) {
      inviteCode = generateInviteCode();
    }

    const league = await prisma.league.create({
      data: {
        name,
        weeklyAllowance: Number(weeklyAllowance),
        inviteCode,
        creatorId: req.userId,
        maxTeams: mt,
        startWeek: sw,
        regularSeasonWeeks: rsw,
        playoffWeeks: pw,
        playoffSize: ps,
        consolationTeams,
        consolationWeeks,
      },
    });

    res.status(201).json(league);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Commissioner updates advanced settings (only before season starts)
router.patch("/:id", requireAuth, async (req: any, res: any) => {
  try {
    const league = await prisma.league.findUnique({ where: { id: req.params.id } });
    if (!league) { res.status(404).json({ error: "League not found" }); return; }
    if (league.creatorId !== req.userId) { res.status(403).json({ error: "Commissioner only" }); return; }
    if (league.seasonStarted) { res.status(400).json({ error: "Cannot change settings after season has started" }); return; }

    const { startWeek, regularSeasonWeeks, playoffSize, consolationWeeks } = req.body;

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
    if (!Number.isInteger(Math.log2(ps)) || ps < 2 || ps >= league.maxTeams) {
      res.status(400).json({ error: `Playoff teams must be a power of 2 less than ${league.maxTeams}` }); return;
    }

    const pw = Math.log2(ps);
    const endWeek = sw + rsw + pw - 1;
    if (endWeek > 18) {
      res.status(400).json({ error: `Season would end on NFL week ${endWeek}, which exceeds week 18` }); return;
    }

    const updated = await prisma.league.update({
      where: { id: req.params.id },
      data: {
        startWeek: sw,
        regularSeasonWeeks: rsw,
        playoffWeeks: pw,
        playoffSize: ps,
        consolationTeams: league.maxTeams - ps,
        consolationWeeks: cw,
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

router.delete("/:id", requireAuth, requireAdmin, async (req: any, res: any) => {
  try {
    const league = await prisma.league.findUnique({ where: { id: req.params.id } });
    if (!league) { res.status(404).json({ error: "League not found" }); return; }

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
