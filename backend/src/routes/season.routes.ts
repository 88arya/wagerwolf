import { Router } from "express";
import { prisma } from "../db/prisma";
import { requireAuth } from "../middleware/auth";

const router = Router();

function generateRoundRobin(userIds: string[]): Array<[string, string][]> {
  const n = userIds.length;
  const ids = [...userIds];
  const rounds: Array<[string, string][]> = [];

  for (let round = 0; round < n - 1; round++) {
    const pairs: [string, string][] = [];
    for (let i = 0; i < n / 2; i++) {
      pairs.push([ids[i], ids[n - 1 - i]]);
    }
    rounds.push(pairs);
    const last = ids.pop()!;
    ids.splice(1, 0, last);
  }

  return rounds;
}

// Start the season — generate round-robin schedule
router.post("/:leagueId/season/start", requireAuth, async (req: any, res: any) => {
  try {
    const { leagueId } = req.params;

    const league = await prisma.league.findUnique({
      where: { id: leagueId },
      include: { memberships: { include: { user: true } } },
    }) as any;

    if (!league) { res.status(404).json({ error: "League not found" }); return; }
    if (league.creatorId !== req.userId) { res.status(403).json({ error: "Only the league creator can start the season" }); return; }
    if (league.seasonStarted) { res.status(400).json({ error: "Season already started" }); return; }

    const members = league.memberships;
    if (members.length < 2) { res.status(400).json({ error: "Need at least 2 members to start" }); return; }
    if (members.length % 2 !== 0) { res.status(400).json({ error: "Need an even number of members" }); return; }

    const userIds = members.map((m: any) => m.userId);
    const rounds = generateRoundRobin(userIds);

    const matchups = [];
    for (let i = 0; i < rounds.length; i++) {
      const weekNumber = i + 1;
      for (const [homeUserId, awayUserId] of rounds[i]) {
        const matchup = await prisma.matchup.create({
          data: { leagueId, weekNumber, homeUserId, awayUserId },
        });
        matchups.push(matchup);
      }
    }

    await prisma.league.update({ where: { id: leagueId }, data: { seasonStarted: true } });

    res.json({ weeks: rounds.length, matchups });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Get matchups for a league, optionally filtered by weekNumber
router.get("/:leagueId/matchups", requireAuth, async (req: any, res: any) => {
  try {
    const { leagueId } = req.params;
    const { weekNumber } = req.query;

    const matchups = await prisma.matchup.findMany({
      where: {
        leagueId,
        ...(weekNumber ? { weekNumber: Number(weekNumber) } : {}),
      },
      include: {
        homeUser: { select: { id: true, displayName: true } },
        awayUser: { select: { id: true, displayName: true } },
      },
      orderBy: { weekNumber: "asc" },
    });

    res.json(matchups);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
