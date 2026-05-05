import { Router } from "express";
import { prisma } from "../db/prisma";

const router = Router({ mergeParams: true });

router.post("/join", async (req: any, res: any) => {
  const { id: leagueId } = req.params;
  const { userId } = req.body;

  const league = await prisma.league.findUnique({ where: { id: leagueId } });

  if (!league) {
    res.status(404).json({ error: "League not found" });
    return;
  }

  const membership = await prisma.membership.create({
    data: {
      userId,
      leagueId,
      balance: league.startingBalance,
    },
  });

  res.status(201).json(membership);
});

router.get("/leaderboard", async (req: any, res: any) => {
  const { id: leagueId } = req.params;

  const memberships = await prisma.membership.findMany({
    where: { leagueId },
    orderBy: { balance: "desc" },
    include: { user: { select: { id: true, displayName: true } } },
  }) as any[];

  const leaderboard = memberships.map((m, i) => ({
    rank: i + 1,
    userId: m.user.id,
    displayName: m.user.displayName,
    balance: m.balance,
  }));

  res.json(leaderboard);
});

export default router;
