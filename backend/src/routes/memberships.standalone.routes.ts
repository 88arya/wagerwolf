import { Router } from "express";
import { prisma } from "../db/prisma";
import { requireAuth } from "../middleware/auth";

const router = Router();

// Active memberships only (shown in "My Leagues" list)
router.get("/", requireAuth, async (req: any, res: any) => {
  try {
    const memberships = await prisma.membership.findMany({
      where: { userId: req.userId, status: "ACTIVE" },
      include: { league: true },
    });
    res.json(memberships);
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

    const membership = await prisma.membership.create({
      data: { userId: req.userId, leagueId: league.id, balance: 0, status: "PENDING" },
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
    const existingMemberships = await prisma.membership.findMany({
      where: { userId: req.userId },
      select: { leagueId: true },
    });
    const existingLeagueIds = existingMemberships.map((m) => m.leagueId);

    // 1. Try pure public leagues
    const publicLeagues = await prisma.league.findMany({
      where: {
        isPublic: true,
        seasonStarted: false,
        ...(existingLeagueIds.length > 0 ? { id: { notIn: existingLeagueIds } } : {}),
      },
      include: {
        memberships: { where: { status: "ACTIVE" }, select: { id: true } },
      },
    });

    const availablePublic = publicLeagues
      .filter((l) => l.memberships.length < l.maxTeams)
      .sort((a, b) => b.memberships.length - a.memberships.length);

    if (availablePublic.length > 0) {
      const league = availablePublic[0];
      const membership = await prisma.membership.create({
        data: { userId: req.userId, leagueId: league.id, balance: 0, status: "ACTIVE", isPublicFill: false },
      });
      res.status(201).json({ ...membership, league });
      return;
    }

    // 2. Try public-fill slots in private leagues
    const privateWithFill = await prisma.league.findMany({
      where: {
        isPublic: false,
        seasonStarted: false,
        maxPublicPlayers: { gt: 0 },
        ...(existingLeagueIds.length > 0 ? { id: { notIn: existingLeagueIds } } : {}),
      },
      include: {
        memberships: { where: { status: "ACTIVE" }, select: { id: true, isPublicFill: true } },
      },
    });

    const availableFill = (privateWithFill as any[])
      .filter((l: any) => {
        const publicFillCount = l.memberships.filter((m: any) => m.isPublicFill).length;
        return publicFillCount < l.maxPublicPlayers && l.memberships.length < l.maxTeams;
      })
      .sort((a: any, b: any) => b.memberships.length - a.memberships.length);

    if (availableFill.length === 0) {
      res.status(404).json({ error: "No public leagues available right now" }); return;
    }

    const league = availableFill[0];
    const membership = await prisma.membership.create({
      data: { userId: req.userId, leagueId: league.id, balance: 0, status: "ACTIVE", isPublicFill: true },
    });

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
