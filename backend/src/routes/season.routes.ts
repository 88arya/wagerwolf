import { Router } from "express";
import { db } from "../db/db";
import { eq, and, asc } from "drizzle-orm";
import { leagues, memberships, weeks, matchups, users } from "../db/schema";
import { requireAuth } from "../middleware/auth";
import { generateLeagueName } from "../services/leagueName";
import { startLeagueSeason } from "../services/startSeason";

const MAX_NFL_WEEK = 17;

async function ensureOpenPublicLeague(creatorId: string) {
  const open = await db.query.leagues.findFirst({
    where: and(eq(leagues.isPublic, true), eq(leagues.seasonStarted, false)),
    with: { memberships: true },
  }) as any;
  if (open && open.memberships.filter((m: any) => m.status === "ACTIVE").length < open.maxPlayers) return;

  const playoffSize = 6;
  const playoffWeeks = Math.ceil(Math.log2(playoffSize));
  const maxPlayers = 10;

  const firstUnresolved = await db.query.weeks.findFirst({
    where: eq(weeks.resolved, false),
  });
  let startWeek = 1;
  if (firstUnresolved) startWeek = firstUnresolved.number === 1 ? 2 : firstUnresolved.number;
  const regularSeasonWeeks = Math.max(1, MAX_NFL_WEEK - startWeek - playoffWeeks + 1);

  let inviteCode = Math.random().toString(36).substring(2, 8).toUpperCase();
  while (await db.query.leagues.findFirst({ where: eq(leagues.inviteCode, inviteCode) })) {
    inviteCode = Math.random().toString(36).substring(2, 8).toUpperCase();
  }

  await db.insert(leagues).values({
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
    consolationTeams: 0,
    consolationWeeks: 0,
  });
}

const router = Router();

router.post("/:leagueId/season/start", requireAuth, async (req: any, res: any) => {
  try {
    const { leagueId } = req.params;

    const league = await db.query.leagues.findFirst({
      where: eq(leagues.id, leagueId),
    });

    if (!league) { res.status(404).json({ error: "League not found" }); return; }
    if (league.creatorId !== req.userId) { res.status(403).json({ error: "Only the league creator can start the season" }); return; }
    if (league.seasonStarted) { res.status(400).json({ error: "Season already started" }); return; }

    const result = await startLeagueSeason(leagueId);

    if (league.isPublic) {
      await ensureOpenPublicLeague(league.creatorId);
    }

    res.json(result);
  } catch (err: any) {
    if (err.message === "Need at least 2 members to start") {
      res.status(400).json({ error: err.message }); return;
    }
    res.status(500).json({ error: err.message });
  }
});

router.get("/:leagueId/matchups", requireAuth, async (req: any, res: any) => {
  try {
    const { leagueId } = req.params;
    const { weekNumber } = req.query;

    const whereClause = weekNumber
      ? and(eq(matchups.leagueId, leagueId), eq(matchups.weekNumber, Number(weekNumber)))
      : eq(matchups.leagueId, leagueId);

    const [matchupRows, membershipRows] = await Promise.all([
      db.query.matchups.findMany({
        where: whereClause,
        with: {
          homeUser: true,
          awayUser: true,
        },
        orderBy: [asc(matchups.weekNumber)],
      }),
      db.query.memberships.findMany({
        where: and(eq(memberships.leagueId, leagueId), eq(memberships.status, "ACTIVE")),
        with: { user: true },
      }),
    ]);

    const nameMap: Record<string, string> = {};
    for (const m of membershipRows as any[]) nameMap[m.userId] = m.displayName || m.user.displayName;

    const augmented = (matchupRows as any[]).map((mu) => ({
      ...mu,
      homeUser: mu.homeUser
        ? { ...mu.homeUser, displayName: nameMap[mu.homeUser.id] ?? mu.homeUser.displayName }
        : mu.homeUser,
      awayUser: mu.awayUser
        ? { ...mu.awayUser, displayName: nameMap[mu.awayUser.id] ?? mu.awayUser.displayName }
        : mu.awayUser,
    }));

    res.json(augmented);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
