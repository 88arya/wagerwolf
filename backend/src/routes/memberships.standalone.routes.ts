import { Router } from "express";
import { db } from "../db/db";
import { eq, and, inArray, or, isNull, isNotNull, gt, gte, lte, sql } from "drizzle-orm";
import { users, leagues, memberships, weeks, matchups, picks, gamePicks, parlays, parlayLegs, props, games, gameLines } from "../db/schema";
import { requireAuth } from "../middleware/auth";
import { scheduleMatchups } from "../services/scheduleMatchups";
import { resolveLeagueIdentity } from "../services/leagueIdentity";
import { pickHelmetColor } from "../services/helmetColor";
import { generateAbbreviation } from "../services/abbreviation";
import { generateLeagueName } from "../services/leagueName";
import { tallyRecords, compareStandings } from "../services/standings";
import { matchAndJoin, selectableStartWeeks } from "../services/matchmaking";
import { LEAGUE_LEVELS } from "../services/leagueLevel";
import { isUniqueViolation } from "../db/pgErrors";

const router = Router();

// `ensureOpenPublicLeague` used to live here: it topped the pool up with a
// fresh public league whenever one filled. Quick Join replaced it — when
// nothing fits, it creates a league and seats the user as commissioner, so
// supply is replenished by the person who needed it rather than by a
// side effect of somebody else's join. See services/matchmaking.ts.


// Active memberships only (shown in "My Leagues" list)
router.get("/", requireAuth, async (req: any, res: any) => {
  try {
    const userMemberships = await db.query.memberships.findMany({
      where: and(eq(memberships.userId, req.userId), eq(memberships.status, "ACTIVE")),
      with: {
        league: true,
        user: true,
      },
      orderBy: (memberships, { asc }) => [asc(memberships.createdAt)],
    }) as any[];

    const currentWeek = await db.query.weeks.findFirst({
      where: eq(weeks.resolved, false),
      orderBy: (weeks, { asc }) => [asc(weeks.number)],
    });

    const leagueIds = userMemberships.map((m: any) => m.leagueId);

    if (leagueIds.length === 0) {
      res.json([]);
      return;
    }

    // Fetch all matchups for these leagues (resolved ones feed records/streaks;
    // unresolved playoff ones tell us who is still alive in the bracket).
    // Ghost matchups count — they resolve against the league mean and can be lost.
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

    // Bet counts per league for the current week, scoped by the week the bet's
    // game belongs to — same semantics as the maxBetsPerWeek enforcement in
    // picks/gamepicks/parlays routes (countWeekBets). No current week → 0.
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

      // A parlay counts toward the week if any leg touches it; legs reach games
      // via props or via gameLines, so dedupe parlay ids across both paths
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
      (mu: any) => mu.isTie || (mu.winnerId && mu.winnerId !== "")
    );

    const enriched = userMemberships.map((m: any) => {
      const league = m.league;
      const nflWeek = currentWeek?.number ?? null;
      const weekOffset = nflWeek != null ? nflWeek - league.startWeek + 1 : null;
      const regularSeasonWeeks: number = league.regularSeasonWeeks;
      const playoffWeeks: number = league.playoffWeeks;
      const isPlayoffs = weekOffset != null && weekOffset > regularSeasonWeeks;
      const phaseWeek = isPlayoffs ? weekOffset - regularSeasonWeeks : weekOffset;
      const phaseTotal = isPlayoffs ? playoffWeeks : regularSeasonWeeks;

      // W/L/T + streak (byes are self-matchups, not contests — skip them)
      const userMatchups = resolvedMatchups.filter(
        (mu: any) => mu.leagueId === m.leagueId && mu.homeUserId !== mu.awayUserId &&
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

      // Rank within this league — same tally + sort as leaderboard and playoff seeding
      const leagueMembers = allLeagueMembers.filter((mem) => mem.leagueId === m.leagueId);
      const memberRecords = tallyRecords(
        leagueMembers,
        resolvedMatchups.filter((mu: any) => mu.leagueId === m.leagueId)
      );
      const sorted = Object.entries(memberRecords).sort(([, a], [, b]) => compareStandings(a, b));
      const rank = sorted.findIndex(([uid]) => uid === m.userId) + 1;
      const totalMembers = leagueMembers.length;

      // Alive in the playoffs = appears in a bracket matchup (incl. byes) for the
      // current playoff week; eliminated members simply have no matchup that week
      const alive = !isPlayoffs || allMatchups.some(
        (mu: any) => mu.leagueId === m.leagueId && mu.isPlayoff && mu.weekNumber === nflWeek &&
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
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Pending join requests for the current user
router.get("/pending", requireAuth, async (req: any, res: any) => {
  try {
    const rows = await db.query.memberships.findMany({
      where: and(eq(memberships.userId, req.userId), eq(memberships.status, "PENDING")),
      with: { league: true, user: true },
      orderBy: (memberships, { asc }) => [asc(memberships.createdAt)],
    }) as any[];
    res.json(rows.map((r) => ({
      ...r,
      displayName: r.displayName || r.user?.displayName || r.user?.name || "",
    })));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Private league: enter invite code → creates PENDING membership awaiting commissioner approval
router.post("/join-by-code", requireAuth, async (req: any, res: any) => {
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

    // Deliberately no seat claim: this creates a PENDING request, and a queue
    // entry must not hold a seat or one unanswered request would block a league
    // forever. The seat is taken when the commissioner accepts — see
    // approvePendingMembership.
    // The user has to be loaded before the colour, not alongside it: the
    // account default feeds pickHelmetColor, which is what makes a join-by-code
    // request use the same identity as every other join path.
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
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Legacy quick-join. Kept because it is a live route with clients in the wild;
 * it delegates to the same matchmaking as /quick-join rather than carrying its
 * own copy of "find an open league", which had drifted into a different (and
 * unbounded) implementation.
 */
router.post("/join-public", requireAuth, async (req: any, res: any) => {
  try {
    const result = await matchAndJoin(req.userId, {});
    res.status(201).json({ ...result.membership, league: result.league });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Quick Join — the only way into a public league.
 *
 * There is no directory endpoint any more. `GET /discover` returned a ranked,
 * cursor-paginated page of open leagues with search, skill-band and
 * country/region filters; players are now assigned rather than shown a list, so
 * all of it went. `POST /join/:leagueId` went with it — with nothing listing
 * league ids, the only way to name a specific league is an invite code, which
 * is `/join-by-code`.
 *
 * Three inputs: how many teams, beginner or pro, and which NFL week the season
 * starts. Only the first can be compromised on.
 */
router.post("/quick-join", requireAuth, async (req: any, res: any) => {
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
      // The client says what it could not honour. A silent compromise is how
      // someone ends up in an 8-team league having asked for 12 and never
      // finds out why.
      relaxedSize: result.relaxedSize,
      created: result.created,
      startWeek: result.startWeek,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * What the join sheet can offer.
 *
 * Start weeks come from the Week table rather than a hardcoded 1..17, because
 * a week that has already resolved is not a start week. Levels ride along so
 * the two pickers have one source and cannot drift apart.
 */
router.get("/join-options", requireAuth, async (_req: any, res: any) => {
  try {
    const startWeeks = await selectableStartWeeks();
    res.json({
      startWeeks: startWeeks.map(w => ({ number: w.number, startDate: w.startDate })),
      defaultStartWeek: startWeeks[0]?.number ?? 1,
      levels: LEAGUE_LEVELS,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
