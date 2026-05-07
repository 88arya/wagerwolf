import { Router } from "express";
import { prisma } from "../db/prisma";
import { requireAuth } from "../middleware/auth";

const router = Router({ mergeParams: true });

router.post("/join", requireAuth, async (req: any, res: any) => {
  try {
    const { id: leagueId } = req.params;
    const userId = req.userId;

    const league = await prisma.league.findUnique({ where: { id: leagueId } });
    if (!league) { res.status(404).json({ error: "League not found" }); return; }

    const membership = await prisma.membership.create({
      data: { userId, leagueId, balance: 0 },
    });

    res.status(201).json(membership);
  } catch (err: any) {
    if (err.code === "P2002") {
      res.status(409).json({ error: "Already a member of this league" });
    } else {
      res.status(500).json({ error: err.message });
    }
  }
});


router.get("/leaderboard", requireAuth, async (req: any, res: any) => {
  try {
    const { id: leagueId } = req.params;

    const [memberships, matchups] = await Promise.all([
      prisma.membership.findMany({
        where: { leagueId },
        include: { user: { select: { id: true, displayName: true } } },
      }) as any,
      prisma.matchup.findMany({
        where: { leagueId, OR: [{ winnerId: { not: null } }, { isTie: true }] },
      }) as any,
    ]);

    const records: Record<string, { wins: number; losses: number; ties: number }> = {};
    for (const m of memberships) {
      records[m.user.id] = { wins: 0, losses: 0, ties: 0 };
    }
    for (const matchup of matchups) {
      if (matchup.isTie) {
        if (records[matchup.homeUserId]) records[matchup.homeUserId].ties++;
        if (records[matchup.awayUserId]) records[matchup.awayUserId].ties++;
      } else if (matchup.winnerId) {
        const loserId = matchup.winnerId === matchup.homeUserId ? matchup.awayUserId : matchup.homeUserId;
        if (records[matchup.winnerId]) records[matchup.winnerId].wins++;
        if (records[loserId]) records[loserId].losses++;
      }
    }

    const leaderboard = (memberships as any[])
      .map((m: any) => ({
        userId: m.user.id,
        displayName: m.user.displayName,
        balance: m.balance,
        ...records[m.user.id],
      }))
      .sort((a: any, b: any) => b.wins - a.wins || b.balance - a.balance)
      .map((entry: any, i: number) => ({ rank: i + 1, ...entry }));

    res.json(leaderboard);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.delete("/members/:memberId", requireAuth, async (req: any, res: any) => {
  try {
    const { id: leagueId, memberId } = req.params;

    const league = await prisma.league.findUnique({ where: { id: leagueId } });
    if (!league) { res.status(404).json({ error: "League not found" }); return; }
    if (league.creatorId !== req.userId) {
      res.status(403).json({ error: "Only the league creator can remove members" });
      return;
    }
    if (memberId === req.userId) {
      res.status(400).json({ error: "Cannot remove yourself" });
      return;
    }

    await prisma.membership.deleteMany({ where: { userId: memberId, leagueId } });
    res.json({ message: "Member removed" });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
