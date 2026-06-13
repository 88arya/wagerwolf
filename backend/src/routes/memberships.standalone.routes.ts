import { Router } from "express";
import { db } from "../db/db";
import { eq, and, inArray, or, isNull, isNotNull, gt, gte, lte, sql } from "drizzle-orm";
import { users, leagues, memberships, weeks, matchups, picks, gamePicks, parlays } from "../db/schema";
import { requireAuth } from "../middleware/auth";
import { scheduleMatchups } from "../services/scheduleMatchups";
import { pickHelmetColor } from "../services/helmetColor";
import { generateAbbreviation } from "../services/abbreviation";
import { generateLeagueName } from "../services/leagueName";

const router = Router();

async function ensureOpenPublicLeague(creatorId: string) {
  const open = await db.query.leagues.findFirst({
    where: and(eq(leagues.isPublic, true), eq(leagues.seasonStarted, false)),
    with: { memberships: { where: eq(memberships.status, "ACTIVE") } },
  }) as any;
  if (open && open.memberships.length < open.maxPlayers) return;

  const [{ value: leagueCount }] = await db
    .select({ value: sql<number>`count(*)::int` })
    .from(leagues)
    .where(eq(leagues.isPublic, true));

  const playoffSize = 6;
  const playoffWeeks = Math.ceil(Math.log2(playoffSize));
  const maxPlayers = 10;

  const firstUnresolved = await db.query.weeks.findFirst({
    where: eq(weeks.resolved, false),
    orderBy: (weeks, { asc }) => [asc(weeks.number)],
  });
  let startWeek = 1;
  if (firstUnresolved) startWeek = firstUnresolved.number === 1 ? 2 : firstUnresolved.number;
  const regularSeasonWeeks = Math.max(1, 18 - startWeek - playoffWeeks + 1);

  let inviteCode = Math.random().toString(36).substring(2, 8).toUpperCase();
  while (true) {
    const [existing] = await db
      .select({ id: leagues.id })
      .from(leagues)
      .where(eq(leagues.inviteCode, inviteCode))
      .limit(1);
    if (!existing) break;
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
    consolationTeams: maxPlayers - playoffSize,
    consolationWeeks: 2,
  });
}

// Active memberships only (shown in "My Leagues" list)
router.get("/", requireAuth, async (req: any, res: any) => {
  try {
    const userMemberships = await db.query.memberships.findMany({
      where: and(eq(memberships.userId, req.userId), eq(memberships.status, "ACTIVE")),
      with: {
        league: true,
        user: true,
      },
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

    const weekFilter = currentWeek
      ? { gte: currentWeek.startDate, lte: currentWeek.endDate }
      : undefined;

    // Fetch all resolved/tied matchups for these leagues
    const allMatchups = await db
      .select()
      .from(matchups)
      .where(
        and(
          inArray(matchups.leagueId, leagueIds),
          eq(matchups.isGhostMatchup, false),
          or(isNotNull(matchups.winnerId), eq(matchups.isTie, true))
        )
      )
      .orderBy(matchups.weekNumber) as any[];

    // Fetch all active members for these leagues
    const allLeagueMembers = await db
      .select({ userId: memberships.userId, leagueId: memberships.leagueId, balance: memberships.balance })
      .from(memberships)
      .where(and(inArray(memberships.leagueId, leagueIds), eq(memberships.status, "ACTIVE")));

    // Bet counts per league (picks, gamePicks, parlays) scoped to current week if available
    let pickCounts: Array<{ leagueId: string; cnt: number }> = [];
    let gamePickCounts: Array<{ leagueId: string; cnt: number }> = [];
    let parlayCounts: Array<{ leagueId: string; cnt: number }> = [];

    if (weekFilter) {
      const pickCountRows = await db
        .select({ leagueId: picks.leagueId, cnt: sql<number>`count(*)::int` })
        .from(picks)
        .where(
          and(
            eq(picks.userId, req.userId),
            inArray(picks.leagueId, leagueIds),
            gte(picks.createdAt, weekFilter.gte),
            lte(picks.createdAt, weekFilter.lte)
          )
        )
        .groupBy(picks.leagueId);
      pickCounts = pickCountRows as any;

      const gamePickCountRows = await db
        .select({ leagueId: gamePicks.leagueId, cnt: sql<number>`count(*)::int` })
        .from(gamePicks)
        .where(
          and(
            eq(gamePicks.userId, req.userId),
            inArray(gamePicks.leagueId, leagueIds),
            gte(gamePicks.createdAt, weekFilter.gte),
            lte(gamePicks.createdAt, weekFilter.lte)
          )
        )
        .groupBy(gamePicks.leagueId);
      gamePickCounts = gamePickCountRows as any;

      const parlayCountRows = await db
        .select({ leagueId: parlays.leagueId, cnt: sql<number>`count(*)::int` })
        .from(parlays)
        .where(
          and(
            eq(parlays.userId, req.userId),
            inArray(parlays.leagueId, leagueIds),
            gte(parlays.createdAt, weekFilter.gte),
            lte(parlays.createdAt, weekFilter.lte)
          )
        )
        .groupBy(parlays.leagueId);
      parlayCounts = parlayCountRows as any;
    } else {
      const pickCountRows = await db
        .select({ leagueId: picks.leagueId, cnt: sql<number>`count(*)::int` })
        .from(picks)
        .where(and(eq(picks.userId, req.userId), inArray(picks.leagueId, leagueIds)))
        .groupBy(picks.leagueId);
      pickCounts = pickCountRows as any;

      const gamePickCountRows = await db
        .select({ leagueId: gamePicks.leagueId, cnt: sql<number>`count(*)::int` })
        .from(gamePicks)
        .where(and(eq(gamePicks.userId, req.userId), inArray(gamePicks.leagueId, leagueIds)))
        .groupBy(gamePicks.leagueId);
      gamePickCounts = gamePickCountRows as any;

      const parlayCountRows = await db
        .select({ leagueId: parlays.leagueId, cnt: sql<number>`count(*)::int` })
        .from(parlays)
        .where(and(eq(parlays.userId, req.userId), inArray(parlays.leagueId, leagueIds)))
        .groupBy(parlays.leagueId);
      parlayCounts = parlayCountRows as any;
    }

    const betsMap: Record<string, number> = {};
    for (const c of pickCounts) betsMap[c.leagueId] = (betsMap[c.leagueId] ?? 0) + c.cnt;
    for (const c of gamePickCounts) betsMap[c.leagueId] = (betsMap[c.leagueId] ?? 0) + c.cnt;
    for (const c of parlayCounts) betsMap[c.leagueId] = (betsMap[c.leagueId] ?? 0) + c.cnt;

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

      // W/L/T + streak
      const userMatchups = resolvedMatchups.filter(
        (mu: any) => mu.leagueId === m.leagueId && (mu.homeUserId === m.userId || mu.awayUserId === m.userId)
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

      // Rank within this league
      const leagueMembers = allLeagueMembers.filter((mem) => mem.leagueId === m.leagueId);
      const memberRecords: Record<string, { wins: number; losses: number; ties: number; balance: number }> = {};
      for (const mem of leagueMembers) memberRecords[mem.userId] = { wins: 0, losses: 0, ties: 0, balance: mem.balance };
      for (const mu of resolvedMatchups.filter((mu: any) => mu.leagueId === m.leagueId)) {
        if (mu.isTie) {
          if (memberRecords[mu.homeUserId]) memberRecords[mu.homeUserId].ties++;
          if (memberRecords[mu.awayUserId]) memberRecords[mu.awayUserId].ties++;
        } else if (mu.winnerId) {
          const loserId = mu.winnerId === mu.homeUserId ? mu.awayUserId : mu.homeUserId;
          if (memberRecords[mu.winnerId]) memberRecords[mu.winnerId].wins++;
          if (memberRecords[loserId]) memberRecords[loserId].losses++;
        }
      }
      const sorted = Object.entries(memberRecords).sort(([, a], [, b]) =>
        b.wins - a.wins || b.ties - a.ties || b.balance - a.balance
      );
      const rank = sorted.findIndex(([uid]) => uid === m.userId) + 1;
      const totalMembers = leagueMembers.length;

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
      with: { league: true },
    });
    res.json(rows);
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

    const [helmetColor, joiningUser] = await Promise.all([
      pickHelmetColor(league.id),
      db.query.users.findFirst({
        where: eq(users.id, req.userId),
      }),
    ]);
    const abbreviation = generateAbbreviation(joiningUser?.displayName ?? "");

    try {
      const [membership] = await db.insert(memberships).values({
        userId: req.userId,
        leagueId: league.id,
        balance: 0,
        status: "PENDING",
        helmetColor,
        abbreviation,
        displayName: joiningUser?.displayName ?? "",
      }).returning();

      res.status(201).json({ ...membership, league });
    } catch (insertErr: any) {
      if (insertErr.code === "23505") {
        res.status(409).json({ error: "You already have a membership or pending request for this league" });
      } else {
        throw insertErr;
      }
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Public join: first try pure public leagues, then public-fill private leagues
router.post("/join-public", requireAuth, async (req: any, res: any) => {
  try {
    const [existingMembershipsRows, publicUser] = await Promise.all([
      db.select({ leagueId: memberships.leagueId }).from(memberships).where(eq(memberships.userId, req.userId)),
      db.query.users.findFirst({ where: eq(users.id, req.userId) }),
    ]);
    const abbreviation = generateAbbreviation(publicUser?.displayName ?? "");
    const existingLeagueIds = existingMembershipsRows.map((m) => m.leagueId);

    // 1. Try pure public leagues
    const publicLeagueRows = await db.query.leagues.findMany({
      where: and(
        eq(leagues.isPublic, true),
        eq(leagues.seasonStarted, false),
        or(isNull(leagues.autoStartAt), gt(leagues.autoStartAt, new Date()))
      ),
      with: {
        memberships: {
          where: eq(memberships.status, "ACTIVE"),
        },
      },
    }) as any[];

    // Filter out leagues where user is already a member
    const filteredPublic = existingLeagueIds.length > 0
      ? publicLeagueRows.filter((l: any) => !existingLeagueIds.includes(l.id))
      : publicLeagueRows;

    const availablePublic = filteredPublic
      .filter((l: any) => l.memberships.length < l.maxPlayers)
      .sort((a: any, b: any) => b.memberships.length - a.memberships.length);

    if (availablePublic.length > 0) {
      const league = availablePublic[0];
      const maxWeek = league.startWeek + league.regularSeasonWeeks + league.playoffWeeks - 1;
      const activeWeek = await db.query.weeks.findFirst({
        where: and(
          eq(weeks.resolved, false),
          gte(weeks.number, league.startWeek),
          lte(weeks.number, maxWeek)
        ),
        orderBy: (weeks, { asc }) => [asc(weeks.number)],
      });
      const helmetColor = await pickHelmetColor(league.id);

      try {
        const [membership] = await db.insert(memberships).values({
          userId: req.userId,
          leagueId: league.id,
          balance: activeWeek ? league.weeklyAllowance : 0,
          status: "ACTIVE",
          isPublicFill: false,
          helmetColor,
          abbreviation,
          displayName: publicUser?.displayName ?? "",
        }).returning();

        await scheduleMatchups(league.id);

        // If this join filled the public league, ensure another is open
        const freshLeagueMemberships = await db
          .select({ id: memberships.id })
          .from(memberships)
          .where(and(eq(memberships.leagueId, league.id), eq(memberships.status, "ACTIVE")));
        if (freshLeagueMemberships.length >= league.maxPlayers) {
          await ensureOpenPublicLeague(league.creatorId);
        }

        res.status(201).json({ ...membership, league });
        return;
      } catch (insertErr: any) {
        if (insertErr.code === "23505") {
          res.status(409).json({ error: "Already a member of this league" });
          return;
        }
        throw insertErr;
      }
    }

    // 2. Try public-fill slots in private leagues
    const privateLeagueRows = await db.query.leagues.findMany({
      where: and(
        eq(leagues.isPublic, false),
        eq(leagues.seasonStarted, false),
        gt(leagues.maxPublicPlayers, 0),
        or(isNull(leagues.autoStartAt), gt(leagues.autoStartAt, new Date()))
      ),
      with: {
        memberships: {
          where: eq(memberships.status, "ACTIVE"),
        },
      },
    }) as any[];

    // Filter out leagues where user is already a member
    const filteredPrivate = existingLeagueIds.length > 0
      ? privateLeagueRows.filter((l: any) => !existingLeagueIds.includes(l.id))
      : privateLeagueRows;

    const availableFill = filteredPrivate
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
    const activeWeekFill = await db.query.weeks.findFirst({
      where: and(
        eq(weeks.resolved, false),
        gte(weeks.number, league.startWeek),
        lte(weeks.number, maxWeekFill)
      ),
      orderBy: (weeks, { asc }) => [asc(weeks.number)],
    });
    const helmetColor = await pickHelmetColor(league.id);

    try {
      const [membership] = await db.insert(memberships).values({
        userId: req.userId,
        leagueId: league.id,
        balance: activeWeekFill ? league.weeklyAllowance : 0,
        status: "ACTIVE",
        isPublicFill: true,
        helmetColor,
        abbreviation,
        displayName: publicUser?.displayName ?? "",
      }).returning();

      await scheduleMatchups(league.id);

      res.status(201).json({ ...membership, league });
    } catch (insertErr: any) {
      if (insertErr.code === "23505") {
        res.status(409).json({ error: "Already a member of this league" });
      } else {
        throw insertErr;
      }
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
