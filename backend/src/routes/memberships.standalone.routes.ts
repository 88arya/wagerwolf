import { Router } from "express";
import { db } from "../db/db";
import { PUBLIC_USER } from "../db/publicUser";
import { eq, and, inArray, sql } from "drizzle-orm";
import { users, leagues, memberships, matchups, picks, gamePicks, parlays, parlayLegs, props, games, gameLines } from "../db/schema";
import { requireAuth } from "../middleware/auth";
import { resolveLeagueIdentity } from "../services/leagueIdentity";
import { tallyRecords, compareStandings } from "../services/standings";
import { matchAndJoin, selectableStartWeeks } from "../services/matchmaking";
import { LEAGUE_LEVELS } from "../services/leagueLevel";
import { isUniqueViolation } from "../db/pgErrors";
import { currentWeek as resolveCurrentWeek } from "../services/currentWeek";

const router = Router();

// Active memberships only (shown in "My Leagues" list)
router.get("/", requireAuth, async (req, res, next) => {
  try {
    const userMemberships = await db.query.memberships.findMany({
      where: and(eq(memberships.userId, req.userId), eq(memberships.status, "ACTIVE")),
      with: {
        league: true,
        user: PUBLIC_USER,
      },
      orderBy: (memberships, { asc }) => [asc(memberships.createdAt)],
    }) as any[];

    const currentWeek = await resolveCurrentWeek();

    const leagueIds = userMemberships.map((m) => m.leagueId);

    if (leagueIds.length === 0) {
      res.json([]);
      return;
    }

    const allMatchups = await db
      .select()
      .from(matchups)
      .where(inArray(matchups.leagueId, leagueIds))
      .orderBy(matchups.weekNumber) as any[];

    // Fetch all active members for these leagues
    const allLeagueMembers = await db
      .select({ userId: memberships.userId, leagueId: memberships.leagueId, balance: memberships.balance })
      .from(memberships)
      .where(and(inArray(memberships.leagueId, leagueIds), eq(memberships.status, "ACTIVE")));

    const betsMap: Record<string, number> = {};

    if (currentWeek) {
      const pickCountRows = await db
        .select({ leagueId: picks.leagueId, cnt: sql<number>`count(*)::int` })
        .from(picks)
        .innerJoin(props, eq(picks.propId, props.id))
        .innerJoin(games, eq(props.gameId, games.id))
        .where(
          and(
            eq(picks.userId, req.userId),
            inArray(picks.leagueId, leagueIds),
            eq(games.weekId, currentWeek.id)
          )
        )
        .groupBy(picks.leagueId);

      const gamePickCountRows = await db
        .select({ leagueId: gamePicks.leagueId, cnt: sql<number>`count(*)::int` })
        .from(gamePicks)
        .innerJoin(gameLines, eq(gamePicks.gameLineId, gameLines.id))
        .innerJoin(games, eq(gameLines.gameId, games.id))
        .where(
          and(
            eq(gamePicks.userId, req.userId),
            inArray(gamePicks.leagueId, leagueIds),
            eq(games.weekId, currentWeek.id)
          )
        )
        .groupBy(gamePicks.leagueId);

      const parlayViaProps = await db
        .select({ leagueId: parlays.leagueId, parlayId: parlays.id })
        .from(parlays)
        .innerJoin(parlayLegs, eq(parlayLegs.parlayId, parlays.id))
        .innerJoin(props, eq(parlayLegs.propId, props.id))
        .innerJoin(games, eq(props.gameId, games.id))
        .where(
          and(
            eq(parlays.userId, req.userId),
            inArray(parlays.leagueId, leagueIds),
            eq(games.weekId, currentWeek.id)
          )
        );

      const parlayViaGameLines = await db
        .select({ leagueId: parlays.leagueId, parlayId: parlays.id })
        .from(parlays)
        .innerJoin(parlayLegs, eq(parlayLegs.parlayId, parlays.id))
        .innerJoin(gameLines, eq(parlayLegs.gameLineId, gameLines.id))
        .innerJoin(games, eq(gameLines.gameId, games.id))
        .where(
          and(
            eq(parlays.userId, req.userId),
            inArray(parlays.leagueId, leagueIds),
            eq(games.weekId, currentWeek.id)
          )
        );

      const parlaysByLeague: Record<string, Set<string>> = {};
      for (const r of [...parlayViaProps, ...parlayViaGameLines]) {
        (parlaysByLeague[r.leagueId] ??= new Set()).add(r.parlayId);
      }

      for (const c of pickCountRows) betsMap[c.leagueId] = (betsMap[c.leagueId] ?? 0) + c.cnt;
      for (const c of gamePickCountRows) betsMap[c.leagueId] = (betsMap[c.leagueId] ?? 0) + c.cnt;
      for (const [lid, ids] of Object.entries(parlaysByLeague)) betsMap[lid] = (betsMap[lid] ?? 0) + ids.size;
    }

    // Filter matchups to only ones that have actually resolved (winnerId not null or isTie)
    const resolvedMatchups = allMatchups.filter(
      (mu) => mu.isTie || (mu.winnerId && mu.winnerId !== "")
    );

    const enriched = userMemberships.map((m) => {
      const league = m.league;
      const nflWeek = currentWeek?.number ?? null;
      const weekOffset = nflWeek != null ? nflWeek - league.startWeek + 1 : null;
      const regularSeasonWeeks: number = league.regularSeasonWeeks;
      const playoffWeeks: number = league.playoffWeeks;
      const isPlayoffs = weekOffset != null && weekOffset > regularSeasonWeeks;
      const phaseWeek = isPlayoffs ? weekOffset - regularSeasonWeeks : weekOffset;
      const phaseTotal = isPlayoffs ? playoffWeeks : regularSeasonWeeks;

      // W/L/T + streak (byes are self-matchups, not contests - skip them)
      const userMatchups = resolvedMatchups.filter(
        (mu) => mu.leagueId === m.leagueId && mu.homeUserId !== mu.awayUserId &&
          (mu.homeUserId === m.userId || mu.awayUserId === m.userId)
      );
      let wins = 0, losses = 0, ties = 0;
      for (const mu of userMatchups) {
        if (mu.isTie) ties++;
        else if (mu.winnerId === m.userId) wins++;
        else losses++;
      }
      let streakCount = 0, streakType = "";
      for (let i = userMatchups.length - 1; i >= 0; i--) {
        const mu = userMatchups[i];
        const r = mu.isTie ? "T" : mu.winnerId === m.userId ? "W" : "L";
        if (streakCount === 0) { streakType = r; streakCount = 1; }
        else if (r === streakType) streakCount++;
        else break;
      }

      // Rank within this league - same tally + sort as leaderboard and playoff seeding
      const leagueMembers = allLeagueMembers.filter((mem) => mem.leagueId === m.leagueId);
      const memberRecords = tallyRecords(
        leagueMembers,
        resolvedMatchups.filter((mu) => mu.leagueId === m.leagueId)
      );
      const sorted = Object.entries(memberRecords).sort(([, a], [, b]) => compareStandings(a, b));
      const rank = sorted.findIndex(([uid]) => uid === m.userId) + 1;
      const totalMembers = leagueMembers.length;

      const alive = !isPlayoffs || allMatchups.some(
        (mu) => mu.leagueId === m.leagueId && mu.isPlayoff && mu.weekNumber === nflWeek &&
          (mu.homeUserId === m.userId || mu.awayUserId === m.userId)
      );

      return {
        ...m,
        displayName: m.displayName || m.user?.displayName || m.user?.name || "",
        weekContext: !league.seasonStarted
          ? { phase: "waiting" }
          : league.seasonEnded
          ? { phase: "ended", champion: league.championId === m.userId }
          : weekOffset != null && weekOffset >= 1
          ? { phase: isPlayoffs ? "playoffs" : "regular", week: phaseWeek, total: phaseTotal, alive }
          : { phase: "preseason", startsNflWeek: league.startWeek },
        wins,
        losses,
        ties,
        streak: streakCount > 0 ? `${streakType}${streakCount}` : null,
        rank: rank || null,
        totalMembers,
        betsThisWeek: betsMap[m.leagueId] ?? 0,
      };
    });

    res.json(enriched);
  } catch (err) {
    next(err); return;
  }
});

// Pending join requests for the current user
router.get("/pending", requireAuth, async (req, res, next) => {
  try {
    const rows = await db.query.memberships.findMany({
      where: and(eq(memberships.userId, req.userId), eq(memberships.status, "PENDING")),
      with: { league: true, user: PUBLIC_USER },
      orderBy: (memberships, { asc }) => [asc(memberships.createdAt)],
    }) as any[];
    res.json(rows.map((r) => ({
      ...r,
      displayName: r.displayName || r.user?.displayName || r.user?.name || "",
    })));
  } catch (err) {
    next(err); return;
  }
});

// Private league: enter invite code -> creates PENDING membership awaiting commissioner approval
router.post("/join-by-code", requireAuth, async (req, res, next) => {
  try {
    const { code } = req.body;
    if (!code) { res.status(400).json({ error: "Invite code required" }); return; }

    const [league] = await db
      .select()
      .from(leagues)
      .where(eq(leagues.inviteCode, code.toUpperCase()))
      .limit(1);
    if (!league) { res.status(404).json({ error: "Invalid invite code" }); return; }
    if (league.isPublic) { res.status(400).json({ error: "This is a public league — use the public join option" }); return; }
    if (league.seasonStarted) {
      res.status(400).json({ error: "This league has already started" }); return;
    }

    // No seat claim: PENDING requests don't hold a seat until approved.
    const joiningUser = await db.query.users.findFirst({
      where: eq(users.id, req.userId),
    });
    const identity = await resolveLeagueIdentity(league.id, joiningUser);

    try {
      const [membership] = await db.insert(memberships).values({
        userId: req.userId,
        leagueId: league.id,
        balance: 0,
        status: "PENDING",
        ...identity,
      }).returning();

      res.status(201).json({ ...membership, league });
    } catch (insertErr: any) {
      if (isUniqueViolation(insertErr)) {
        res.status(409).json({ error: "You already have a membership or pending request for this league" });
      } else {
        throw insertErr;
      }
    }
  } catch (err) {
    next(err); return;
  }
});

// Legacy alias for quick-join.
router.post("/join-public", requireAuth, async (req, res, next) => {
  try {
    const result = await matchAndJoin(req.userId, {});
    res.status(201).json({ ...result.membership, league: result.league });
  } catch (err) {
    next(err); return;
  }
});

// The only way into a public league (see services/matchmaking).
router.post("/quick-join", requireAuth, async (req, res, next) => {
  try {
    const { maxPlayers, level, startWeek } = req.body ?? {};
    const result = await matchAndJoin(req.userId, {
      maxPlayers: maxPlayers ? Number(maxPlayers) : null,
      level: typeof level === "string" ? level.toUpperCase() : null,
      startWeek: startWeek ? Number(startWeek) : null,
    });

    res.status(201).json({
      ...result.membership,
      league: result.league,
      relaxedSize: result.relaxedSize,
      created: result.created,
      startWeek: result.startWeek,
    });
  } catch (err) {
    next(err); return;
  }
});

router.get("/join-options", requireAuth, async (_req, res, next) => {
  try {
    const startWeeks = await selectableStartWeeks();
    res.json({
      startWeeks: startWeeks.map(w => ({ number: w.number, startDate: w.startDate })),
      defaultStartWeek: startWeeks[0]?.number ?? 1,
      levels: LEAGUE_LEVELS,
    });
  } catch (err) {
    next(err); return;
  }
});

export default router;
