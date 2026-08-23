import { Router } from "express";
import { db } from "../db/db";
import {
  eq, and, inArray, or, isNotNull, ne, gte, lte, desc, asc,
} from "drizzle-orm";
import {
  users, leagues, memberships, weeks, games, props, picks,
  gameLines, gamePicks, parlays, leagueMessages, matchups,
} from "../db/schema";
import { requireAuth } from "../middleware/auth";
import { approvePendingMembership, joinLeague } from "../services/joinLeague";
import { validateDisplayName } from "../services/displayName";
import { validateAbbreviation } from "../services/abbreviationRules";
import { releaseSeat } from "../services/leagueSeats";
import { scheduleMatchups } from "../services/scheduleMatchups";
import { pickHelmetColor } from "../services/helmetColor";
import { generateAbbreviation } from "../services/abbreviation";
import { tallyRecords, compareStandings } from "../services/standings";

const router = Router({ mergeParams: true });

// Creator joining their own league after creation — always ACTIVE
router.post("/join", requireAuth, async (req: any, res: any) => {
  try {
    const { id: leagueId } = req.params;
    const userId = req.userId;

    const league = await db.query.leagues.findFirst({ where: eq(leagues.id, leagueId) });
    if (!league) { res.status(404).json({ error: "League not found" }); return; }

    // Seat claim + membership insert, atomically — see services/joinLeague.ts.
    // This used to read capacity separately and then insert, which let two
    // people take the same last seat.
    const outcome = await joinLeague(userId, league);
    if (!outcome.ok) {
      if (outcome.reason === "DUPLICATE") { res.status(409).json({ error: "Already a member of this league" }); return; }
      if (outcome.reason === "MISSING") { res.status(404).json({ error: "League not found" }); return; }
      res.status(400).json({ error: "This league is full" });
      return;
    }

    res.status(201).json(outcome.membership);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/leaderboard", requireAuth, async (req: any, res: any) => {
  try {
    const { id: leagueId } = req.params;

    const [memberRows, matchupRows] = await Promise.all([
      db.query.memberships.findMany({
        where: and(eq(memberships.leagueId, leagueId), eq(memberships.status, "ACTIVE")),
        with: { user: true },
      }),
      db.select().from(matchups).where(
        and(
          eq(matchups.leagueId, leagueId),
          or(isNotNull(matchups.winnerId), eq(matchups.isTie, true)),
        )
      ),
    ]);

    const validMembers = memberRows.filter((m) => m.user != null);

    const records = tallyRecords(
      validMembers.map((m: any) => ({ userId: m.user.id, balance: m.balance })),
      matchupRows
    );

    const leaderboard = validMembers
      .map((m: any) => ({
        userId: m.user.id,
        displayName: m.displayName || m.user.displayName,
        abbreviation: m.abbreviation,
        joinedAt: m.createdAt,
        helmetColor: m.helmetColor,
        ...records[m.user.id],
      }))
      .sort(compareStandings)
      .map((entry: any, i: number) => ({ rank: i + 1, ...entry }));

    // Compute previous week standings (exclude most recent resolved week)
    const weekNumbers = matchupRows.map((m) => m.weekNumber);
    const latestWeekNumber = weekNumbers.length ? Math.max(...weekNumbers) : null;
    if (latestWeekNumber !== null) {
      const prevRecords = tallyRecords(
        validMembers.map((m: any) => ({ userId: m.user.id, balance: m.balance })),
        matchupRows.filter((matchup) => matchup.weekNumber !== latestWeekNumber)
      );
      const prevRankMap: Record<string, number> = {};
      [...validMembers]
        .map((m: any) => ({ userId: m.user.id, ...prevRecords[m.user.id] }))
        .sort(compareStandings)
        .forEach((entry: any, i: number) => { prevRankMap[entry.userId] = i + 1; });
      for (const entry of leaderboard) {
        (entry as any).prevRank = prevRankMap[entry.userId] ?? entry.rank;
      }
    }

    res.json(leaderboard);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Update current user's abbreviation for this league
router.patch("/my-abbreviation", requireAuth, async (req: any, res: any) => {
  try {
    const { id: leagueId } = req.params;
    const { abbreviation } = req.body;
    const checked = validateAbbreviation(abbreviation ?? "");
    if (!checked.ok) { res.status(400).json({ error: checked.error }); return; }
    await db.update(memberships)
      .set({ abbreviation: checked.value })
      .where(and(eq(memberships.leagueId, leagueId), eq(memberships.userId, req.userId)));
    res.json({ abbreviation: checked.value });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Update current user's display name for this league
router.patch("/my-display-name", requireAuth, async (req: any, res: any) => {
  try {
    const { id: leagueId } = req.params;
    const { displayName } = req.body;
    const checked = validateDisplayName(displayName);
    if (!checked.ok) { res.status(400).json({ error: checked.error }); return; }
    await db.update(memberships)
      .set({ displayName: checked.value })
      .where(and(eq(memberships.leagueId, leagueId), eq(memberships.userId, req.userId)));
    res.json({ displayName: checked.value });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Update current user's shield color for this league
router.patch("/my-helmet", requireAuth, async (req: any, res: any) => {
  try {
    const { id: leagueId } = req.params;
    const { helmetColor } = req.body;
    if (!helmetColor || !/^#[0-9a-fA-F]{6}$/.test(helmetColor)) {
      res.status(400).json({ error: "Invalid color" }); return;
    }
    const taken = await db.query.memberships.findFirst({
      where: and(
        eq(memberships.leagueId, leagueId),
        eq(memberships.helmetColor, helmetColor),
        ne(memberships.userId, req.userId),
        eq(memberships.status, "ACTIVE"),
      ),
    });
    if (taken) {
      res.status(409).json({ error: "Another member is already using that color" }); return;
    }
    await db.update(memberships)
      .set({ helmetColor })
      .where(and(eq(memberships.leagueId, leagueId), eq(memberships.userId, req.userId)));
    res.json({ helmetColor });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Commissioner: list pending join requests
router.get("/pending", requireAuth, async (req: any, res: any) => {
  try {
    const { id: leagueId } = req.params;
    const league = await db.query.leagues.findFirst({ where: eq(leagues.id, leagueId) });
    if (!league) { res.status(404).json({ error: "League not found" }); return; }
    if (league.creatorId !== req.userId) { res.status(403).json({ error: "Commissioner only" }); return; }

    const pending = await db.query.memberships.findMany({
      where: and(eq(memberships.leagueId, leagueId), eq(memberships.status, "PENDING")),
      with: { user: true },
    });
    res.json(pending);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Commissioner: accept a pending member
router.post("/members/:memberId/accept", requireAuth, async (req: any, res: any) => {
  try {
    const { id: leagueId, memberId } = req.params;
    const league = await db.query.leagues.findFirst({ where: eq(leagues.id, leagueId) });
    if (!league) { res.status(404).json({ error: "League not found" }); return; }
    if (league.creatorId !== req.userId) { res.status(403).json({ error: "Commissioner only" }); return; }
    if (league.seasonStarted) {
      res.status(400).json({ error: "League has already started — cannot accept new members" }); return;
    }

    const maxWeek = league.startWeek + league.regularSeasonWeeks + league.playoffWeeks - 1;
    // A queued request holds no seat, so approving one has to claim it — and
    // can therefore fail if the league filled while the request sat in the
    // queue. Previously this flipped the status unconditionally and could push
    // a league past maxPlayers.
    const outcome = await approvePendingMembership(memberId, league);
    if (!outcome.ok) {
      if (outcome.reason === "MISSING") { res.status(404).json({ error: "No pending request found" }); return; }
      res.status(400).json({ error: "The league is full — free a spot before accepting" });
      return;
    }

    res.json({ message: "Member accepted" });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Commissioner: remove or reject a member (works for both ACTIVE and PENDING, before season only)
router.delete("/members/:memberId", requireAuth, async (req: any, res: any) => {
  try {
    const { id: leagueId, memberId } = req.params;

    const league = await db.query.leagues.findFirst({ where: eq(leagues.id, leagueId) });
    if (!league) { res.status(404).json({ error: "League not found" }); return; }
    if (league.creatorId !== req.userId) {
      res.status(403).json({ error: "Only the league creator can remove members" }); return;
    }
    if (memberId === league.creatorId) {
      res.status(400).json({ error: "Cannot remove the commissioner" }); return;
    }
    if (league.seasonStarted) {
      res.status(400).json({ error: "Cannot remove members after season has started" }); return;
    }

    // Only an ACTIVE membership holds a seat; rejecting a PENDING request must
    // not decrement, which is why the deleted row is inspected rather than the
    // delete count.
    const removed = await db.delete(memberships)
      .where(and(eq(memberships.userId, memberId), eq(memberships.leagueId, leagueId)))
      .returning();
    for (const m of removed) {
      if (m.status === "ACTIVE") await releaseSeat(leagueId, { isPublicFill: m.isPublicFill });
    }
    res.json({ message: "Member removed" });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Member leaves their own league (not commissioner, before season starts)
router.post("/leave", requireAuth, async (req: any, res: any) => {
  try {
    const { id: leagueId } = req.params;
    const userId = req.userId;

    const league = await db.query.leagues.findFirst({ where: eq(leagues.id, leagueId) });
    if (!league) { res.status(404).json({ error: "League not found" }); return; }
    if (league.creatorId === userId) { res.status(400).json({ error: "Commissioner cannot leave the league" }); return; }
    if (league.seasonStarted) { res.status(400).json({ error: "Cannot leave after season has started" }); return; }

    const deleted = await db.delete(memberships)
      .where(and(eq(memberships.userId, userId), eq(memberships.leagueId, leagueId)))
      .returning();
    if (deleted.length === 0) { res.status(404).json({ error: "Not a member of this league" }); return; }

    // Hand the seat back so the league becomes joinable again.
    for (const m of deleted) {
      if (m.status === "ACTIVE") await releaseSeat(leagueId, { isPublicFill: m.isPublicFill });
    }

    res.json({ message: "Left league" });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Bet Feed ──────────────────────────────────────────────────────────────────
// Returns all visible bets for the current week across all members.
// Visibility: AFTER_KICKOFF = only games that have kicked off; AFTER_RESOLVE = only resolved weeks.
router.get("/feed", requireAuth, async (req: any, res: any) => {
  try {
    const { id: leagueId } = req.params;
    const weekNumber = req.query.weekNumber ? Number(req.query.weekNumber) : undefined;

    const [league, membership] = await Promise.all([
      db.query.leagues.findFirst({ where: eq(leagues.id, leagueId) }),
      db.query.memberships.findFirst({
        where: and(
          eq(memberships.leagueId, leagueId),
          eq(memberships.userId, req.userId),
          eq(memberships.status, "ACTIVE"),
        ),
      }),
    ]);
    if (!league) { res.status(404).json({ error: "League not found" }); return; }
    if (!membership) { res.status(403).json({ error: "Not a member" }); return; }

    const now = new Date();

    if (league.feedVisibility === "AFTER_RESOLVE") {
      const week = await db.query.weeks.findFirst({
        where: weekNumber ? eq(weeks.number, weekNumber) : eq(weeks.resolved, false),
        // If no weekNumber, we want the current (unresolved) week — if it's not resolved, show nothing
      });
      if (!week?.resolved) { res.json([]); return; }
    }

    // Resolve the target week to get game IDs for filtering
    let targetWeekGameIds: string[] | null = null;
    {
      const targetWeek = await db.query.weeks.findFirst({
        where: weekNumber ? eq(weeks.number, weekNumber) : eq(weeks.resolved, false),
      });
      if (targetWeek) {
        const weekGames = await db.select({ id: games.id }).from(games).where(eq(games.weekId, targetWeek.id));
        targetWeekGameIds = weekGames.map((g) => g.id);
      }
    }

    if (!targetWeekGameIds || targetWeekGameIds.length === 0) {
      res.json([]); return;
    }

    const leagueMembers = await db.query.memberships.findMany({
      where: and(eq(memberships.leagueId, leagueId), eq(memberships.status, "ACTIVE")),
      with: { user: true },
    });
    const nameMap: Record<string, string> = {};
    for (const m of leagueMembers) if (m.user) nameMap[m.userId] = m.displayName || m.user.displayName;

    // Narrow game IDs further by kickoff time if AFTER_KICKOFF
    let visibleGameIds: string[] = targetWeekGameIds;
    if (league.feedVisibility === "AFTER_KICKOFF") {
      const kickedOffGames = await db.select({ id: games.id }).from(games)
        .where(and(inArray(games.id, targetWeekGameIds), lte(games.gameDate, now)));
      visibleGameIds = kickedOffGames.map((g) => g.id);
    }

    if (visibleGameIds.length === 0 && league.feedVisibility === "AFTER_KICKOFF") {
      res.json([]); return;
    }

    // Resolve propIds and gameLineIds for the visible games
    const [visibleProps, visibleGameLines] = await Promise.all([
      db.select({ id: props.id }).from(props).where(inArray(props.gameId, visibleGameIds)),
      db.select({ id: gameLines.id }).from(gameLines).where(inArray(gameLines.gameId, visibleGameIds)),
    ]);
    const visiblePropIds = visibleProps.map((p) => p.id);
    const visibleGameLineIds = visibleGameLines.map((gl) => gl.id);

    // Fetch picks: filtered to visible propIds
    const picksRows = visiblePropIds.length > 0
      ? await db.query.picks.findMany({
          where: and(
            eq(picks.leagueId, leagueId),
            inArray(picks.propId, visiblePropIds),
          ),
          with: {
            prop: {
              with: {
                player: true,
                game: true,
              },
            },
          },
        })
      : [];

    // Fetch gamePicks: filtered to visible gameLineIds
    const gamePicksRows = visibleGameLineIds.length > 0
      ? await db.query.gamePicks.findMany({
          where: and(
            eq(gamePicks.leagueId, leagueId),
            inArray(gamePicks.gameLineId, visibleGameLineIds),
          ),
          with: {
            gameLine: {
              with: { game: true },
            },
          },
        })
      : [];

    // Fetch parlays for this league
    const parlaysRows = await db.query.parlays.findMany({
      where: eq(parlays.leagueId, leagueId),
      with: {
        legs: {
          with: {
            prop: {
              with: {
                game: true,
                player: true,
              },
            },
            gameLine: {
              with: { game: true },
            },
          },
        },
      },
    });

    // Filter parlays to those with at least one leg in this week's games
    const weekGameIdSet = new Set(targetWeekGameIds);
    const weekParlays = parlaysRows.filter((p) =>
      p.legs.some((l) => {
        const gid = l.prop?.gameId ?? l.gameLine?.gameId;
        return gid && weekGameIdSet.has(gid);
      })
    );

    // Filter parlays by kickoff if AFTER_KICKOFF
    const visibleParlays = league.feedVisibility === "AFTER_KICKOFF"
      ? weekParlays.filter((p) =>
          p.legs.some((l) => {
            const gameDate = (l.prop?.game as any)?.gameDate ?? (l.gameLine?.game as any)?.gameDate;
            return gameDate && new Date(gameDate) < now;
          })
        )
      : weekParlays;

    // We need user info for picks/gamePicks/parlays — fetch user rows for userId lookups
    const allUserIds = Array.from(new Set([
      ...picksRows.map((p) => p.userId),
      ...gamePicksRows.map((p) => p.userId),
      ...visibleParlays.map((p) => p.userId),
    ]));
    const userRows = allUserIds.length > 0
      ? await db.select().from(users).where(inArray(users.id, allUserIds))
      : [];
    const userMap: Record<string, typeof userRows[0]> = {};
    for (const u of userRows) userMap[u.id] = u;

    const feed = [
      ...picksRows.map((p) => ({
        type: "pick" as const,
        createdAt: p.createdAt,
        userId: p.userId,
        displayName: nameMap[p.userId] ?? userMap[p.userId]?.displayName ?? "",
        pick: {
          ...p,
          user: { id: p.userId, displayName: userMap[p.userId]?.displayName ?? "" },
        },
      })),
      ...gamePicksRows.map((p) => ({
        type: "gamepick" as const,
        createdAt: p.createdAt,
        userId: p.userId,
        displayName: nameMap[p.userId] ?? userMap[p.userId]?.displayName ?? "",
        pick: {
          ...p,
          user: { id: p.userId, displayName: userMap[p.userId]?.displayName ?? "" },
        },
      })),
      ...visibleParlays.map((p) => ({
        type: "parlay" as const,
        createdAt: p.createdAt,
        userId: p.userId,
        displayName: nameMap[p.userId] ?? userMap[p.userId]?.displayName ?? "",
        pick: {
          ...p,
          user: { id: p.userId, displayName: userMap[p.userId]?.displayName ?? "" },
        },
      })),
    ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    res.json(feed);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Chat ──────────────────────────────────────────────────────────────────────
router.get("/messages", requireAuth, async (req: any, res: any) => {
  try {
    const { id: leagueId } = req.params;
    const membership = await db.query.memberships.findFirst({
      where: and(
        eq(memberships.leagueId, leagueId),
        eq(memberships.userId, req.userId),
        eq(memberships.status, "ACTIVE"),
      ),
    });
    if (!membership) { res.status(403).json({ error: "Not a member" }); return; }

    const [rawMessages, memberRows] = await Promise.all([
      db.query.leagueMessages.findMany({
        where: eq(leagueMessages.leagueId, leagueId),
        with: { user: true },
        // orderBy desc, take 50, then reverse for chronological
      }),
      db.query.memberships.findMany({
        where: and(eq(memberships.leagueId, leagueId), eq(memberships.status, "ACTIVE")),
        with: { user: true },
      }),
    ]);

    // Take last 50 ordered by createdAt desc then reverse
    const sortedMessages = [...rawMessages]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 50);

    const chatNameMap: Record<string, string> = {};
    for (const m of memberRows) if (m.user) chatNameMap[m.userId] = m.displayName || m.user.displayName;

    const messages = sortedMessages.map((msg) => ({
      ...msg,
      user: { ...msg.user, displayName: chatNameMap[msg.user.id] ?? msg.user.displayName },
    }));

    res.json(messages.reverse());
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/messages", requireAuth, async (req: any, res: any) => {
  try {
    const { id: leagueId } = req.params;
    const { body } = req.body;
    if (!body?.trim()) { res.status(400).json({ error: "Message cannot be empty" }); return; }
    if (body.trim().length > 500) { res.status(400).json({ error: "Message too long (500 chars max)" }); return; }

    const membership = await db.query.memberships.findFirst({
      where: and(
        eq(memberships.leagueId, leagueId),
        eq(memberships.userId, req.userId),
        eq(memberships.status, "ACTIVE"),
      ),
    });
    if (!membership) { res.status(403).json({ error: "Not a member" }); return; }

    const [message, senderMembership] = await Promise.all([
      db.insert(leagueMessages).values({ leagueId, userId: req.userId, body: body.trim() }).returning(),
      db.query.memberships.findFirst({
        where: and(eq(memberships.leagueId, leagueId), eq(memberships.userId, req.userId)),
      }),
    ]);
    const [createdMsg] = message;
    const msgUser = await db.query.users.findFirst({ where: eq(users.id, req.userId) });
    const leagueName = senderMembership?.displayName || msgUser?.displayName || "";

    res.status(201).json({
      ...createdMsg,
      user: { id: req.userId, displayName: leagueName },
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.delete("/messages/:msgId", requireAuth, async (req: any, res: any) => {
  try {
    const { id: leagueId, msgId } = req.params;
    const [msg, league] = await Promise.all([
      db.query.leagueMessages.findFirst({ where: eq(leagueMessages.id, msgId) }),
      db.query.leagues.findFirst({ where: eq(leagues.id, leagueId) }),
    ]);
    if (!msg || msg.leagueId !== leagueId) { res.status(404).json({ error: "Message not found" }); return; }

    const isAuthor = msg.userId === req.userId;
    const isCommissioner = league?.creatorId === req.userId;
    if (!isAuthor && !isCommissioner) { res.status(403).json({ error: "Cannot delete this message" }); return; }

    await db.delete(leagueMessages).where(eq(leagueMessages.id, msgId));
    res.json({ message: "Deleted" });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Member Stats ──────────────────────────────────────────────────────────────
router.get("/members/:targetUserId/stats", requireAuth, async (req: any, res: any) => {
  try {
    const { id: leagueId, targetUserId } = req.params;

    const [membership, targetMembership, leaderboardMembers] = await Promise.all([
      db.query.memberships.findFirst({
        where: and(
          eq(memberships.leagueId, leagueId),
          eq(memberships.userId, req.userId),
          eq(memberships.status, "ACTIVE"),
        ),
      }),
      db.query.memberships.findFirst({
        where: and(
          eq(memberships.leagueId, leagueId),
          eq(memberships.userId, targetUserId),
          eq(memberships.status, "ACTIVE"),
        ),
        with: { user: true },
      }),
      db.query.memberships.findMany({
        where: and(eq(memberships.leagueId, leagueId), eq(memberships.status, "ACTIVE")),
        with: { user: true },
      }),
    ]);
    if (!membership) { res.status(403).json({ error: "Not a member" }); return; }
    if (!targetMembership) { res.status(404).json({ error: "Member not found" }); return; }

    const [picksRows, gamePicksRows, parlaysRows, leagueMatchupRows] = await Promise.all([
      db.query.picks.findMany({
        where: and(eq(picks.leagueId, leagueId), eq(picks.userId, targetUserId)),
        with: {
          prop: {
            with: {
              player: true,
              game: true,
            },
          },
        },
      }),
      db.query.gamePicks.findMany({
        where: and(eq(gamePicks.leagueId, leagueId), eq(gamePicks.userId, targetUserId)),
        with: {
          gameLine: {
            with: { game: true },
          },
        },
      }),
      db.query.parlays.findMany({
        where: and(eq(parlays.leagueId, leagueId), eq(parlays.userId, targetUserId)),
        with: { legs: true },
      }),
      db.select().from(matchups).where(eq(matchups.leagueId, leagueId)),
    ]);

    // Byes are self-matchups, not contests — exclude from the target's record
    const matchupRows = leagueMatchupRows.filter(
      (m) => m.homeUserId !== m.awayUserId &&
        (m.homeUserId === targetUserId || m.awayUserId === targetUserId)
    );

    // Sort by createdAt desc
    picksRows.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    gamePicksRows.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    parlaysRows.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    function calcProfit(stake: number, odds: number, outcome: string): number {
      if (outcome === "WIN") return odds > 0 ? Math.round(stake * (odds / 100)) : Math.round(stake * (100 / Math.abs(odds)));
      if (outcome === "LOSS") return -stake;
      return 0;
    }

    const settledPicks = [...picksRows, ...gamePicksRows].filter((p) => p.outcome !== "PENDING");
    const allSettled = settledPicks.map((p) => ({ outcome: p.outcome, profit: calcProfit(p.stake, p.odds, p.outcome) }));

    let totalStaked = 0, totalProfit = 0, wonCount = 0, lostCount = 0;
    for (const p of [...picksRows, ...gamePicksRows, ...parlaysRows]) {
      totalStaked += p.stake;
      if (p.outcome === "WIN") wonCount++;
      if (p.outcome === "LOSS") lostCount++;
      totalProfit += calcProfit(p.stake, (p as any).odds ?? (p as any).totalOdds ?? -110, p.outcome);
    }

    // Streak: look at settled picks in order
    let streak = 0;
    for (const s of allSettled) {
      if (streak === 0) { streak = s.outcome === "WIN" ? 1 : -1; continue; }
      if (s.outcome === "WIN" && streak > 0) streak++;
      else if (s.outcome === "LOSS" && streak < 0) streak--;
      else break;
    }

    // Hit rates and profit per stat type
    const statTypeStats: Record<string, { won: number; total: number; profit: number }> = {};
    for (const p of picksRows) {
      if (p.outcome === "PENDING") continue;
      const st = p.prop.statType;
      if (!statTypeStats[st]) statTypeStats[st] = { won: 0, total: 0, profit: 0 };
      statTypeStats[st].total++;
      if (p.outcome === "WIN") statTypeStats[st].won++;
      statTypeStats[st].profit += calcProfit(p.stake, p.odds, p.outcome);
    }
    const statTypeHitRates = Object.entries(statTypeStats)
      .map(([statType, s]) => ({
        statType,
        won: s.won,
        total: s.total,
        hitRate: Math.round((s.won / s.total) * 100),
        profit: s.profit,
      }))
      .sort((a, b) => b.total - a.total);
    const statEntries = statTypeHitRates.map((s) => [s.statType, s.profit] as [string, number]).sort((a, b) => b[1] - a[1]);

    // Avg weekly winnings across weeks with settled bets
    const weekProfits: Record<string, number> = {};
    for (const p of picksRows) {
      if (p.outcome === "PENDING") continue;
      const wid = p.prop.game.weekId;
      weekProfits[wid] = (weekProfits[wid] ?? 0) + calcProfit(p.stake, p.odds, p.outcome);
    }
    for (const p of gamePicksRows) {
      if (p.outcome === "PENDING") continue;
      const wid = p.gameLine.game.weekId;
      weekProfits[wid] = (weekProfits[wid] ?? 0) + calcProfit(p.stake, p.odds, p.outcome);
    }
    const weeksActive = Object.keys(weekProfits).length;
    const avgWeeklyWinnings = weeksActive > 0 ? Math.round(totalProfit / weeksActive) : 0;

    // Matchup record
    let wins = 0, losses = 0, ties = 0;
    for (const m of matchupRows) {
      if (!m.winnerId && !m.isTie) continue;
      if (m.isTie) { ties++; continue; }
      if (m.winnerId === targetUserId) wins++; else losses++;
    }

    // Rank — same standings logic as leaderboard and my-leagues
    const standingsRecords = tallyRecords(
      leaderboardMembers.map((m: any) => ({ userId: m.userId, balance: m.balance })),
      leagueMatchupRows.filter((m) => m.winnerId != null || m.isTie)
    );
    const rank = Object.entries(standingsRecords)
      .sort(([, a], [, b]) => compareStandings(a, b))
      .findIndex(([uid]) => uid === targetUserId) + 1;

    res.json({
      userId: targetUserId,
      displayName: (targetMembership as any).displayName || (targetMembership as any).user.displayName,
      helmetColor: (targetMembership as any).helmetColor ?? "#0070EB",
      abbreviation: (targetMembership as any).abbreviation ?? "",
      balance: targetMembership.balance,
      rank,
      wins,
      losses,
      ties,
      totalPicks: picksRows.length + gamePicksRows.length + parlaysRows.length,
      wonPicks: wonCount,
      lostPicks: lostCount,
      pendingPicks: picksRows.length + gamePicksRows.length + parlaysRows.length - wonCount - lostCount,
      totalStaked,
      totalProfit,
      roi: totalStaked > 0 ? Math.round((totalProfit / totalStaked) * 1000) / 10 : 0,
      streak,
      avgWeeklyWinnings,
      bestStatType: statEntries[0] ? { statType: statEntries[0][0], profit: statEntries[0][1] } : null,
      worstStatType: statEntries.length > 1 ? { statType: statEntries[statEntries.length - 1][0], profit: statEntries[statEntries.length - 1][1] } : null,
      statTypeHitRates,
      recentPicks: picksRows.slice(0, 10).map((p) => ({
        id: p.id,
        playerName: p.prop.player.name,
        statType: p.prop.statType,
        direction: p.direction,
        line: p.prop.line,
        altLine: p.altLine,
        stake: p.stake,
        odds: p.odds,
        outcome: p.outcome,
        createdAt: p.createdAt,
      })),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Weekly Recap ──────────────────────────────────────────────────────────────
router.get("/recap", requireAuth, async (req: any, res: any) => {
  try {
    const { id: leagueId } = req.params;
    const weekNumber = req.query.weekNumber ? Number(req.query.weekNumber) : undefined;

    const membership = await db.query.memberships.findFirst({
      where: and(
        eq(memberships.leagueId, leagueId),
        eq(memberships.userId, req.userId),
        eq(memberships.status, "ACTIVE"),
      ),
    });
    if (!membership) { res.status(403).json({ error: "Not a member" }); return; }

    // For "most recently resolved", we need desc ordering
    const resolvedWeek = weekNumber
      ? await db.query.weeks.findFirst({ where: eq(weeks.number, weekNumber) })
      : (await db.select().from(weeks).where(eq(weeks.resolved, true)).orderBy(desc(weeks.number)).limit(1))[0];

    if (!resolvedWeek?.resolved) { res.json(null); return; }

    const weekGames = await db.select({ id: games.id }).from(games).where(eq(games.weekId, resolvedWeek.id));
    const gameIds = weekGames.map((g) => g.id);

    // Get propIds for games in this week
    const weekProps = gameIds.length > 0
      ? await db.select({ id: props.id }).from(props).where(inArray(props.gameId, gameIds))
      : [];
    const propIds = weekProps.map((p) => p.id);

    // Get gameLineIds for games in this week
    const weekGameLines = gameIds.length > 0
      ? await db.select({ id: gameLines.id }).from(gameLines).where(inArray(gameLines.gameId, gameIds))
      : [];
    const gameLineIds = weekGameLines.map((gl) => gl.id);

    const [picksRows, gamePicksRows, parlaysRows, matchupRows] = await Promise.all([
      propIds.length > 0
        ? db.query.picks.findMany({
            where: and(
              eq(picks.leagueId, leagueId),
              eq(picks.userId, req.userId),
              inArray(picks.propId, propIds),
            ),
            with: { prop: { with: { player: true } } },
          })
        : Promise.resolve([]),
      gameLineIds.length > 0
        ? db.query.gamePicks.findMany({
            where: and(
              eq(gamePicks.leagueId, leagueId),
              eq(gamePicks.userId, req.userId),
              inArray(gamePicks.gameLineId, gameLineIds),
            ),
            with: { gameLine: true },
          })
        : Promise.resolve([]),
      db.query.parlays.findMany({
        where: and(eq(parlays.leagueId, leagueId), eq(parlays.userId, req.userId)),
        with: {
          legs: {
            with: {
              prop: { with: { game: true } },
              gameLine: { with: { game: true } },
            },
          },
        },
      }),
      db.query.matchups.findMany({
        where: and(
          eq(matchups.leagueId, leagueId),
          eq(matchups.weekNumber, resolvedWeek.number),
          or(eq(matchups.homeUserId, req.userId), eq(matchups.awayUserId, req.userId)),
        ),
        with: { homeUser: true, awayUser: true },
      }),
    ]);

    // Filter parlays to ones with at least one leg in this week's games
    const gameIdSet = new Set(gameIds);
    const weekParlays = parlaysRows.filter((p) =>
      p.legs.some((l) => {
        const gid = l.prop?.gameId ?? l.gameLine?.gameId;
        return gid && gameIdSet.has(gid);
      })
    );

    function calcProfit(stake: number, odds: number, outcome: string): number {
      if (outcome === "WIN") return odds > 0 ? Math.round(stake * (odds / 100)) : Math.round(stake * (100 / Math.abs(odds)));
      if (outcome === "LOSS") return -stake;
      return 0;
    }

    const allBets = [
      ...picksRows.map((p) => ({
        label: `${p.prop.player.name} ${p.direction} ${p.altLine ?? p.prop.line} ${p.prop.statType.split("_").join(" ")}`,
        stake: p.stake, odds: p.odds, outcome: p.outcome,
        profit: calcProfit(p.stake, p.odds, p.outcome),
      })),
      ...gamePicksRows.map((p) => ({
        label: p.gameLine.label,
        stake: p.stake, odds: p.odds, outcome: p.outcome,
        profit: calcProfit(p.stake, p.odds, p.outcome),
      })),
      ...weekParlays.map((p) => ({
        label: `${p.legs.length}-leg parlay`,
        stake: p.stake, odds: p.totalOdds, outcome: p.outcome,
        profit: p.outcome === "WIN" ? p.payout - p.stake : p.outcome === "LOSS" ? -p.stake : 0,
      })),
    ];

    const won = allBets.filter((b) => b.outcome === "WIN").length;
    const lost = allBets.filter((b) => b.outcome === "LOSS").length;
    const pending = allBets.filter((b) => b.outcome === "PENDING").length;
    const totalProfit = allBets.reduce((s, b) => s + b.profit, 0);

    const settled = [...allBets].filter((b) => b.outcome !== "PENDING");
    const bestBet = settled.sort((a, b) => b.profit - a.profit)[0] ?? null;
    const worstBet = [...settled].sort((a, b) => a.profit - b.profit)[0] ?? null;

    const matchup = matchupRows[0] ?? null;

    res.json({
      weekNumber: resolvedWeek.number,
      totalBets: allBets.length,
      won, lost, pending,
      totalProfit,
      bestBet: bestBet ? { label: bestBet.label, profit: bestBet.profit } : null,
      worstBet: worstBet && worstBet.profit < 0 ? { label: worstBet.label, profit: worstBet.profit } : null,
      matchup: matchup ? {
        won: matchup.winnerId === req.userId,
        lost: !!matchup.winnerId && matchup.winnerId !== req.userId,
        tie: matchup.isTie,
        opponentName: matchup.homeUserId === req.userId ? matchup.awayUser?.displayName : matchup.homeUser?.displayName,
        myProfit: matchup.homeUserId === req.userId ? matchup.homeProfit : matchup.awayProfit,
        oppProfit: matchup.homeUserId === req.userId ? matchup.awayProfit : matchup.homeProfit,
      } : null,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
