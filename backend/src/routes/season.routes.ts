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

// Start the season — generate round-robin schedule for regular season
router.post("/:leagueId/season/start", requireAuth, async (req: any, res: any) => {
  try {
    const { leagueId } = req.params;

    const league = await prisma.league.findUnique({
      where: { id: leagueId },
      include: { memberships: { where: { status: "ACTIVE" }, include: { user: true } } },
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

// Start playoffs — seed top N teams, handle non-power-of-2 with bye system
router.post("/:leagueId/season/playoffs/start", requireAuth, async (req: any, res: any) => {
  try {
    const { leagueId } = req.params;
    const { weekNumber } = req.body;

    if (!weekNumber) { res.status(400).json({ error: "weekNumber is required" }); return; }

    const league = await prisma.league.findUnique({
      where: { id: leagueId },
      include: { memberships: { where: { status: "ACTIVE" }, include: { user: { select: { id: true, displayName: true } } } } },
    }) as any;

    if (!league) { res.status(404).json({ error: "League not found" }); return; }
    if (league.creatorId !== req.userId) { res.status(403).json({ error: "Commissioner only" }); return; }
    if (!league.seasonStarted) { res.status(400).json({ error: "Season has not started" }); return; }

    const existingPlayoffs = await prisma.matchup.findFirst({ where: { leagueId, isPlayoff: true } });
    if (existingPlayoffs) { res.status(400).json({ error: "Playoffs already started" }); return; }

    const [memberships, matchups] = await Promise.all([
      prisma.membership.findMany({
        where: { leagueId, status: "ACTIVE" },
        include: { user: { select: { id: true, displayName: true } } },
      }) as any,
      prisma.matchup.findMany({
        where: { leagueId, isPlayoff: false, OR: [{ winnerId: { not: null } }, { isTie: true }] },
      }) as any,
    ]);

    const records: Record<string, { wins: number; losses: number; ties: number; balance: number }> = {};
    for (const m of memberships) {
      records[m.userId] = { wins: 0, losses: 0, ties: 0, balance: m.balance };
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

    const seeded = (memberships as any[])
      .map((m: any) => ({ userId: m.userId, displayName: m.user.displayName, ...records[m.userId] }))
      .sort((a: any, b: any) => b.wins - a.wins || b.balance - a.balance)
      .slice(0, league.playoffSize);

    if (seeded.length < 2) { res.status(400).json({ error: "Not enough teams for playoffs" }); return; }

    const n = seeded.length;
    const isPowerOf2 = (n & (n - 1)) === 0;
    const bracket = [];

    if (isPowerOf2) {
      for (let i = 0; i < n / 2; i++) {
        const matchup = await prisma.matchup.create({
          data: {
            leagueId,
            weekNumber: Number(weekNumber),
            homeUserId: seeded[i].userId,
            awayUserId: seeded[n - 1 - i].userId,
            isPlayoff: true,
            playoffRound: 1,
          },
        });
        bracket.push({ ...matchup, homeSeed: i + 1, awaySeed: n - i, homeDisplayName: seeded[i].displayName, awayDisplayName: seeded[n - 1 - i].displayName });
      }
    } else {
      // Bye system: nextSmallestPow2 teams get byes, rest play in
      const nextPow2 = Math.pow(2, Math.floor(Math.log2(n - 1)));
      const byeCount = 2 * nextPow2 - n;

      // Byes first (seeds 1..byeCount) — pre-seeded with winnerId so advance works naturally
      for (let i = 0; i < byeCount; i++) {
        const byeTeam = seeded[i];
        const matchup = await prisma.matchup.create({
          data: {
            leagueId,
            weekNumber: Number(weekNumber),
            homeUserId: byeTeam.userId,
            awayUserId: byeTeam.userId,
            winnerId: byeTeam.userId,
            isPlayoff: true,
            playoffRound: 1,
            isBye: true,
          },
        });
        bracket.push({ ...matchup, seed: i + 1, displayName: byeTeam.displayName, isBye: true });
      }

      // Play-in matchups (higher seeds vs lower seeds)
      const playInTeams = seeded.slice(byeCount);
      const numPlayIn = playInTeams.length;
      for (let i = 0; i < numPlayIn / 2; i++) {
        const home = playInTeams[i];
        const away = playInTeams[numPlayIn - 1 - i];
        const matchup = await prisma.matchup.create({
          data: {
            leagueId,
            weekNumber: Number(weekNumber),
            homeUserId: home.userId,
            awayUserId: away.userId,
            isPlayoff: true,
            playoffRound: 1,
          },
        });
        bracket.push({ ...matchup, homeSeed: byeCount + i + 1, awaySeed: n - i, homeDisplayName: home.displayName, awayDisplayName: away.displayName });
      }
    }

    res.json({ round: 1, weekNumber, seeds: seeded, bracket });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Advance playoffs — generate next elimination round from previous round's winners
router.post("/:leagueId/season/playoffs/advance", requireAuth, async (req: any, res: any) => {
  try {
    const { leagueId } = req.params;
    const { completedRound, nextWeekNumber } = req.body;

    if (!completedRound || !nextWeekNumber) {
      res.status(400).json({ error: "completedRound and nextWeekNumber are required" }); return;
    }

    const league = await prisma.league.findUnique({ where: { id: leagueId } });
    if (!league) { res.status(404).json({ error: "League not found" }); return; }
    if (league.creatorId !== req.userId) { res.status(403).json({ error: "Commissioner only" }); return; }

    const completedMatchups = await prisma.matchup.findMany({
      where: { leagueId, isPlayoff: true, playoffRound: Number(completedRound) },
      include: {
        homeUser: { select: { id: true, displayName: true } },
        awayUser: { select: { id: true, displayName: true } },
      },
    }) as any[];

    if (completedMatchups.length === 0) {
      res.status(400).json({ error: `No matchups found for playoff round ${completedRound}` }); return;
    }

    // Byes already have winnerId set; only check non-bye matchups
    const unresolvedCount = completedMatchups.filter((m) => !m.isBye && m.winnerId == null && !m.isTie).length;
    if (unresolvedCount > 0) {
      res.status(400).json({ error: `${unresolvedCount} matchup(s) in round ${completedRound} are not yet resolved` }); return;
    }

    const winners = completedMatchups.map((m) => ({
      userId: m.winnerId ?? m.homeUserId,
      displayName: m.winnerId
        ? (m.winnerId === m.homeUserId ? m.homeUser.displayName : m.awayUser.displayName)
        : m.homeUser.displayName,
    }));

    if (winners.length === 1) {
      res.json({ message: "Tournament complete", champion: winners[0] }); return;
    }

    const nextRound = Number(completedRound) + 1;
    const n = winners.length;
    const bracket = [];

    for (let i = 0; i < Math.floor(n / 2); i++) {
      const matchup = await prisma.matchup.create({
        data: {
          leagueId,
          weekNumber: Number(nextWeekNumber),
          homeUserId: winners[i].userId,
          awayUserId: winners[n - 1 - i].userId,
          isPlayoff: true,
          playoffRound: nextRound,
        },
      });
      bracket.push({ ...matchup, homeDisplayName: winners[i].displayName, awayDisplayName: winners[n - 1 - i].displayName });
    }

    res.json({ round: nextRound, weekNumber: nextWeekNumber, bracket });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
