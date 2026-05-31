import { Router } from "express";
import { prisma } from "../db/prisma";
import { requireAuth } from "../middleware/auth";
import { scheduleMatchups } from "../services/scheduleMatchups";
import { pickHelmetColor } from "../services/helmetColor";
import { generateAbbreviation } from "../services/abbreviation";
import { generateLeagueName } from "../services/leagueName";

const router = Router();

async function ensureOpenPublicLeague(creatorId: string) {
  const open = await prisma.league.findFirst({
    where: { isPublic: true, seasonStarted: false },
    include: { memberships: { where: { status: "ACTIVE" }, select: { id: true } } },
  }) as any;
  if (open && open.memberships.length < open.maxPlayers) return;

  const count = await prisma.league.count({ where: { isPublic: true } });
  const playoffSize = 6;
  const playoffWeeks = Math.ceil(Math.log2(playoffSize));
  const maxPlayers = 10;

  const firstUnresolved = await prisma.week.findFirst({ where: { resolved: false }, orderBy: { number: "asc" } });
  let startWeek = 1;
  if (firstUnresolved) startWeek = firstUnresolved.number === 1 ? 2 : firstUnresolved.number;
  const regularSeasonWeeks = Math.max(1, 18 - startWeek - playoffWeeks + 1);

  let inviteCode = Math.random().toString(36).substring(2, 8).toUpperCase();
  while (await prisma.league.findUnique({ where: { inviteCode } })) {
    inviteCode = Math.random().toString(36).substring(2, 8).toUpperCase();
  }

  await prisma.league.create({
    data: {
      name: generateLeagueName(),
      weeklyAllowance: 300,
      inviteCode,
      creatorId,
      isPublic: true,
      maxPlayers,
      startWeek,
      regularSeasonWeeks,
      playoffWeeks,
      playoffSize,
      consolationTeams: maxPlayers - playoffSize,
      consolationWeeks: 2,
    },
  });
}

// Active memberships only (shown in "My Leagues" list)
router.get("/", requireAuth, async (req: any, res: any) => {
  try {
    const [memberships, currentWeek] = await Promise.all([
      prisma.membership.findMany({
        where: { userId: req.userId, status: "ACTIVE" },
        include: { league: true, user: { select: { displayName: true, name: true } } },
      }),
      prisma.week.findFirst({ where: { resolved: false }, orderBy: { number: "asc" } }),
    ]);

    const enriched = memberships.map((m: any) => {
      const league = m.league;
      const nflWeek = currentWeek?.number ?? null;
      const weekOffset = nflWeek != null ? nflWeek - league.startWeek + 1 : null;
      const regularSeasonWeeks: number = league.regularSeasonWeeks;
      const playoffWeeks: number = league.playoffWeeks;
      const isPlayoffs = weekOffset != null && weekOffset > regularSeasonWeeks;
      const phaseWeek = isPlayoffs ? weekOffset - regularSeasonWeeks : weekOffset;
      const phaseTotal = isPlayoffs ? playoffWeeks : regularSeasonWeeks;

      return {
        ...m,
        displayName: m.displayName || m.user?.displayName || m.user?.name || "",
        weekContext: !league.seasonStarted
          ? { phase: "waiting" }
          : league.seasonEnded
          ? { phase: "ended" }
          : weekOffset != null && weekOffset >= 1
          ? { phase: isPlayoffs ? "playoffs" : "regular", week: phaseWeek, total: phaseTotal }
          : { phase: "active" },
      };
    });
    res.json(enriched);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Pending join requests for the current user
router.get("/pending", requireAuth, async (req: any, res: any) => {
  try {
    const memberships = await prisma.membership.findMany({
      where: { userId: req.userId, status: "PENDING" },
      include: { league: true },
    });
    res.json(memberships);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Private league: enter invite code → creates PENDING membership awaiting commissioner approval
router.post("/join-by-code", requireAuth, async (req: any, res: any) => {
  try {
    const { code } = req.body;
    if (!code) { res.status(400).json({ error: "Invite code required" }); return; }

    const league = await prisma.league.findUnique({
      where: { inviteCode: code.toUpperCase() },
    });
    if (!league) { res.status(404).json({ error: "Invalid invite code" }); return; }
    if (league.isPublic) { res.status(400).json({ error: "This is a public league — use the public join option" }); return; }
    if (league.seasonStarted) {
      res.status(400).json({ error: "This league has already started" }); return;
    }

    const [helmetColor, joiningUser] = await Promise.all([
      pickHelmetColor(league.id),
      prisma.user.findUnique({ where: { id: req.userId }, select: { displayName: true } }),
    ]);
    const abbreviation = generateAbbreviation(joiningUser?.displayName ?? "");
    const membership = await prisma.membership.create({
      data: { userId: req.userId, leagueId: league.id, balance: 0, status: "PENDING", helmetColor, abbreviation, displayName: joiningUser?.displayName ?? "" },
    });

    res.status(201).json({ ...membership, league });
  } catch (err: any) {
    if (err.code === "P2002") {
      res.status(409).json({ error: "You already have a membership or pending request for this league" });
    } else {
      res.status(500).json({ error: err.message });
    }
  }
});

// Public join: first try pure public leagues, then public-fill private leagues
router.post("/join-public", requireAuth, async (req: any, res: any) => {
  try {
    const [existingMemberships, publicUser] = await Promise.all([
      prisma.membership.findMany({
        where: { userId: req.userId },
        select: { leagueId: true },
      }),
      prisma.user.findUnique({ where: { id: req.userId }, select: { displayName: true } }),
    ]);
    const abbreviation = generateAbbreviation(publicUser?.displayName ?? "");
    const existingLeagueIds = existingMemberships.map((m) => m.leagueId);

    // 1. Try pure public leagues
    const publicLeagues = await prisma.league.findMany({
      where: {
        isPublic: true,
        seasonStarted: false,
        OR: [{ autoStartAt: null }, { autoStartAt: { gt: new Date() } }],
        ...(existingLeagueIds.length > 0 ? { id: { notIn: existingLeagueIds } } : {}),
      },
      include: {
        memberships: { where: { status: "ACTIVE" }, select: { id: true } },
      },
    });

    const availablePublic = publicLeagues
      .filter((l) => l.memberships.length < l.maxPlayers)
      .sort((a, b) => b.memberships.length - a.memberships.length);

    if (availablePublic.length > 0) {
      const league = availablePublic[0];
      const maxWeek = league.startWeek + league.regularSeasonWeeks + league.playoffWeeks - 1;
      const activeWeek = await prisma.week.findFirst({
        where: { resolved: false, number: { gte: league.startWeek, lte: maxWeek } },
        orderBy: { number: "asc" },
      });
      const helmetColor = await pickHelmetColor(league.id);
      const membership = await prisma.membership.create({
        data: { userId: req.userId, leagueId: league.id, balance: activeWeek ? league.weeklyAllowance : 0, status: "ACTIVE", isPublicFill: false, helmetColor, abbreviation, displayName: publicUser?.displayName ?? "" },
      });
      await scheduleMatchups(league.id);

      // If this join filled the public league, ensure another is open
      const freshLeague = await prisma.league.findUnique({
        where: { id: league.id },
        include: { memberships: { where: { status: "ACTIVE" }, select: { id: true } } },
      }) as any;
      if (freshLeague && freshLeague.memberships.length >= freshLeague.maxPlayers) {
        await ensureOpenPublicLeague(league.creatorId);
      }

      res.status(201).json({ ...membership, league });
      return;
    }

    // 2. Try public-fill slots in private leagues
    const privateWithFill = await prisma.league.findMany({
      where: {
        isPublic: false,
        seasonStarted: false,
        maxPublicPlayers: { gt: 0 },
        OR: [{ autoStartAt: null }, { autoStartAt: { gt: new Date() } }],
        ...(existingLeagueIds.length > 0 ? { id: { notIn: existingLeagueIds } } : {}),
      },
      include: {
        memberships: { where: { status: "ACTIVE" }, select: { id: true, isPublicFill: true } },
      },
    });

    const availableFill = (privateWithFill as any[])
      .filter((l: any) => {
        const publicFillCount = l.memberships.filter((m: any) => m.isPublicFill).length;
        return publicFillCount < l.maxPublicPlayers && l.memberships.length < l.maxPlayers;
      })
      .sort((a: any, b: any) => b.memberships.length - a.memberships.length);

    if (availableFill.length === 0) {
      res.status(404).json({ error: "No public leagues available right now" }); return;
    }

    const league = availableFill[0];
    const maxWeekFill = league.startWeek + league.regularSeasonWeeks + league.playoffWeeks - 1;
    const activeWeekFill = await prisma.week.findFirst({
      where: { resolved: false, number: { gte: league.startWeek, lte: maxWeekFill } },
      orderBy: { number: "asc" },
    });
    const helmetColor = await pickHelmetColor(league.id);
    const membership = await prisma.membership.create({
      data: { userId: req.userId, leagueId: league.id, balance: activeWeekFill ? league.weeklyAllowance : 0, status: "ACTIVE", isPublicFill: true, helmetColor, abbreviation, displayName: publicUser?.displayName ?? "" },
    });

    await scheduleMatchups(league.id);

    res.status(201).json({ ...membership, league });
  } catch (err: any) {
    if (err.code === "P2002") {
      res.status(409).json({ error: "Already a member of this league" });
    } else {
      res.status(500).json({ error: err.message });
    }
  }
});

export default router;
