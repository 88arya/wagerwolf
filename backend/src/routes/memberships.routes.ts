import { Router } from "express";
import { prisma } from "../db/prisma";
import { requireAuth } from "../middleware/auth";
import { scheduleMatchups } from "../services/scheduleMatchups";
import { pickHelmetColor } from "../services/helmetColor";
import { generateAbbreviation } from "../services/abbreviation";

const router = Router({ mergeParams: true });

// Creator joining their own league after creation — always ACTIVE
router.post("/join", requireAuth, async (req: any, res: any) => {
  try {
    const { id: leagueId } = req.params;
    const userId = req.userId;

    const league = await prisma.league.findUnique({ where: { id: leagueId } });
    if (!league) { res.status(404).json({ error: "League not found" }); return; }

    const maxWeek = league.startWeek + league.regularSeasonWeeks + league.playoffWeeks - 1;
    const activeWeek = await prisma.week.findFirst({
      where: { resolved: false, number: { gte: league.startWeek, lte: maxWeek } },
      orderBy: { number: "asc" },
    });
    const initialBalance = activeWeek ? league.weeklyAllowance : 0;

    const [helmetColor, user] = await Promise.all([
      pickHelmetColor(leagueId),
      prisma.user.findUnique({ where: { id: userId }, select: { displayName: true } }),
    ]);
    const abbreviation = generateAbbreviation(user?.displayName ?? "");
    const membership = await prisma.membership.create({
      data: { userId, leagueId, balance: initialBalance, status: "ACTIVE", helmetColor, abbreviation, displayName: user?.displayName ?? "" },
    });

    await scheduleMatchups(leagueId);

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
        where: { leagueId, status: "ACTIVE" },
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
        displayName: m.displayName || m.user.displayName,
        abbreviation: m.abbreviation,
        balance: m.balance,
        joinedAt: m.createdAt,
        helmetColor: m.helmetColor,
        ...records[m.user.id],
      }))
      .sort((a: any, b: any) => b.wins - a.wins || b.ties - a.ties || b.balance - a.balance)
      .map((entry: any, i: number) => ({ rank: i + 1, ...entry }));

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
    const trimmed = (abbreviation ?? "").trim().toUpperCase();
    if (trimmed.length < 2 || trimmed.length > 3 || !/^[A-Z]+$/.test(trimmed)) {
      res.status(400).json({ error: "Abbreviation must be 2–3 letters" }); return;
    }
    await prisma.membership.updateMany({
      where: { leagueId, userId: req.userId },
      data: { abbreviation: trimmed },
    });
    res.json({ abbreviation: trimmed });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Update current user's display name for this league
router.patch("/my-display-name", requireAuth, async (req: any, res: any) => {
  try {
    const { id: leagueId } = req.params;
    const { displayName } = req.body;
    if (!displayName?.trim() || displayName.trim().length > 30) {
      res.status(400).json({ error: "Display name must be 1–30 characters" }); return;
    }
    await prisma.membership.updateMany({
      where: { leagueId, userId: req.userId },
      data: { displayName: displayName.trim() },
    });
    res.json({ displayName: displayName.trim() });
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
    const taken = await prisma.membership.findFirst({
      where: { leagueId, helmetColor, userId: { not: req.userId }, status: "ACTIVE" },
    });
    if (taken) {
      res.status(409).json({ error: "Another member is already using that color" }); return;
    }
    await prisma.membership.updateMany({
      where: { leagueId, userId: req.userId },
      data: { helmetColor },
    });
    res.json({ helmetColor });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Commissioner: list pending join requests
router.get("/pending", requireAuth, async (req: any, res: any) => {
  try {
    const { id: leagueId } = req.params;
    const league = await prisma.league.findUnique({ where: { id: leagueId } });
    if (!league) { res.status(404).json({ error: "League not found" }); return; }
    if (league.creatorId !== req.userId) { res.status(403).json({ error: "Commissioner only" }); return; }

    const pending = await prisma.membership.findMany({
      where: { leagueId, status: "PENDING" },
      include: { user: { select: { id: true, displayName: true } } },
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
    const league = await prisma.league.findUnique({ where: { id: leagueId } });
    if (!league) { res.status(404).json({ error: "League not found" }); return; }
    if (league.creatorId !== req.userId) { res.status(403).json({ error: "Commissioner only" }); return; }
    if (league.seasonStarted) {
      res.status(400).json({ error: "League has already started — cannot accept new members" }); return;
    }

    const maxWeek = league.startWeek + league.regularSeasonWeeks + league.playoffWeeks - 1;
    const activeWeek = await prisma.week.findFirst({
      where: { resolved: false, number: { gte: league.startWeek, lte: maxWeek } },
      orderBy: { number: "asc" },
    });
    const initialBalance = activeWeek ? league.weeklyAllowance : 0;

    const [helmetColor, acceptedUser] = await Promise.all([
      pickHelmetColor(leagueId),
      prisma.user.findUnique({ where: { id: memberId }, select: { displayName: true } }),
    ]);
    const abbreviation = generateAbbreviation(acceptedUser?.displayName ?? "");
    const result = await prisma.membership.updateMany({
      where: { userId: memberId, leagueId, status: "PENDING" },
      data: { status: "ACTIVE", balance: initialBalance, helmetColor, abbreviation },
    });
    if (result.count === 0) { res.status(404).json({ error: "No pending request found" }); return; }

    await scheduleMatchups(leagueId);

    res.json({ message: "Member accepted" });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Commissioner: remove or reject a member (works for both ACTIVE and PENDING, before season only)
router.delete("/members/:memberId", requireAuth, async (req: any, res: any) => {
  try {
    const { id: leagueId, memberId } = req.params;

    const league = await prisma.league.findUnique({ where: { id: leagueId } });
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

    await prisma.membership.deleteMany({ where: { userId: memberId, leagueId } });
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

    const league = await prisma.league.findUnique({ where: { id: leagueId } });
    if (!league) { res.status(404).json({ error: "League not found" }); return; }
    if (league.creatorId === userId) { res.status(400).json({ error: "Commissioner cannot leave the league" }); return; }
    if (league.seasonStarted) { res.status(400).json({ error: "Cannot leave after season has started" }); return; }

    const deleted = await prisma.membership.deleteMany({ where: { userId, leagueId } });
    if (deleted.count === 0) { res.status(404).json({ error: "Not a member of this league" }); return; }

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
      prisma.league.findUnique({ where: { id: leagueId } }),
      prisma.membership.findFirst({ where: { leagueId, userId: req.userId, status: "ACTIVE" } }),
    ]);
    if (!league) { res.status(404).json({ error: "League not found" }); return; }
    if (!membership) { res.status(403).json({ error: "Not a member" }); return; }

    const weekFilter = weekNumber
      ? { week: { number: weekNumber } }
      : { week: { resolved: false } };

    const now = new Date();

    if (league.feedVisibility === "AFTER_RESOLVE") {
      // Only show if week is resolved
      const week = await prisma.week.findFirst({
        where: weekNumber ? { number: weekNumber } : { resolved: false },
        orderBy: { number: "asc" },
      });
      if (!week?.resolved) { res.json([]); return; }
    }

    const leagueMembers = await prisma.membership.findMany({
      where: { leagueId, status: "ACTIVE" },
      include: { user: { select: { id: true, displayName: true } } },
    });
    const nameMap: Record<string, string> = {};
    for (const m of leagueMembers as any[]) nameMap[m.userId] = m.displayName || m.user.displayName;

    const [picks, gamePicks, parlays] = await Promise.all([
      prisma.pick.findMany({
        where: {
          leagueId,
          prop: { game: { ...weekFilter, ...(league.feedVisibility === "AFTER_KICKOFF" ? { gameDate: { lt: now } } : {}) } },
        },
        include: {
          user: { select: { id: true, displayName: true } },
          prop: {
            include: {
              player: { select: { id: true, name: true, position: true, team: true } },
              game: { select: { id: true, homeTeam: true, awayTeam: true, gameDate: true, status: true } },
            },
          },
        },
        orderBy: { createdAt: "desc" },
      }),
      prisma.gamePick.findMany({
        where: {
          leagueId,
          gameLine: { game: { ...weekFilter, ...(league.feedVisibility === "AFTER_KICKOFF" ? { gameDate: { lt: now } } : {}) } },
        },
        include: {
          user: { select: { id: true, displayName: true } },
          gameLine: {
            include: {
              game: { select: { id: true, homeTeam: true, awayTeam: true, gameDate: true, status: true } },
            },
          },
        },
        orderBy: { createdAt: "desc" },
      }),
      prisma.parlay.findMany({
        where: {
          leagueId,
          ...(league.feedVisibility === "AFTER_KICKOFF" ? {} : {}),
        },
        include: {
          user: { select: { id: true, displayName: true } },
          legs: {
            include: {
              prop: { include: { game: { select: { gameDate: true, status: true, homeTeam: true, awayTeam: true } }, player: { select: { name: true } } } },
              gameLine: { include: { game: { select: { gameDate: true, status: true, homeTeam: true, awayTeam: true } } } },
            },
          },
        },
        orderBy: { createdAt: "desc" },
      }),
    ]);

    // Filter parlays: show only if at least one leg's game has kicked off
    const visibleParlays = league.feedVisibility === "AFTER_KICKOFF"
      ? parlays.filter((p) => p.legs.some((l) => {
          const gameDate = l.prop?.game?.gameDate ?? l.gameLine?.game?.gameDate;
          return gameDate && new Date(gameDate) < now;
        }))
      : parlays;

    const feed = [
      ...picks.map((p) => ({ type: "pick" as const, createdAt: p.createdAt, userId: p.user.id, displayName: nameMap[p.user.id] ?? p.user.displayName, pick: p })),
      ...gamePicks.map((p) => ({ type: "gamepick" as const, createdAt: p.createdAt, userId: p.user.id, displayName: nameMap[p.user.id] ?? p.user.displayName, pick: p })),
      ...visibleParlays.map((p) => ({ type: "parlay" as const, createdAt: p.createdAt, userId: p.user.id, displayName: nameMap[p.user.id] ?? p.user.displayName, pick: p })),
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
    const membership = await prisma.membership.findFirst({ where: { leagueId, userId: req.userId, status: "ACTIVE" } });
    if (!membership) { res.status(403).json({ error: "Not a member" }); return; }

    const [rawMessages, memberships] = await Promise.all([
      prisma.leagueMessage.findMany({
        where: { leagueId },
        include: { user: { select: { id: true, displayName: true } } },
        orderBy: { createdAt: "desc" },
        take: 50,
      }),
      prisma.membership.findMany({
        where: { leagueId, status: "ACTIVE" },
        select: { userId: true, displayName: true, user: { select: { displayName: true } } },
      }),
    ]);
    const chatNameMap: Record<string, string> = {};
    for (const m of memberships as any[]) chatNameMap[m.userId] = m.displayName || m.user.displayName;

    const messages = (rawMessages as any[]).map((msg) => ({
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

    const membership = await prisma.membership.findFirst({ where: { leagueId, userId: req.userId, status: "ACTIVE" } });
    if (!membership) { res.status(403).json({ error: "Not a member" }); return; }

    const [message, senderMembership] = await Promise.all([
      prisma.leagueMessage.create({
        data: { leagueId, userId: req.userId, body: body.trim() },
        include: { user: { select: { id: true, displayName: true } } },
      }),
      prisma.membership.findFirst({
        where: { leagueId, userId: req.userId },
        select: { displayName: true },
      }),
    ]);
    const leagueName = (senderMembership as any)?.displayName || (message as any).user.displayName;

    res.status(201).json({ ...message, user: { ...(message as any).user, displayName: leagueName } });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.delete("/messages/:msgId", requireAuth, async (req: any, res: any) => {
  try {
    const { id: leagueId, msgId } = req.params;
    const [msg, league] = await Promise.all([
      prisma.leagueMessage.findUnique({ where: { id: msgId } }),
      prisma.league.findUnique({ where: { id: leagueId } }),
    ]);
    if (!msg || msg.leagueId !== leagueId) { res.status(404).json({ error: "Message not found" }); return; }

    const isAuthor = msg.userId === req.userId;
    const isCommissioner = league?.creatorId === req.userId;
    if (!isAuthor && !isCommissioner) { res.status(403).json({ error: "Cannot delete this message" }); return; }

    await prisma.leagueMessage.delete({ where: { id: msgId } });
    res.json({ message: "Deleted" });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Member Stats ──────────────────────────────────────────────────────────────
router.get("/members/:targetUserId/stats", requireAuth, async (req: any, res: any) => {
  try {
    const { id: leagueId, targetUserId } = req.params;

    const [membership, targetMembership, leaderboard] = await Promise.all([
      prisma.membership.findFirst({ where: { leagueId, userId: req.userId, status: "ACTIVE" } }),
      prisma.membership.findFirst({
        where: { leagueId, userId: targetUserId, status: "ACTIVE" },
        include: { user: { select: { id: true, displayName: true } } },
      }),
      prisma.membership.findMany({
        where: { leagueId, status: "ACTIVE" },
        include: { user: { select: { id: true } } },
      }),
    ]);
    if (!membership) { res.status(403).json({ error: "Not a member" }); return; }
    if (!targetMembership) { res.status(404).json({ error: "Member not found" }); return; }

    const [picks, gamePicks, parlays, matchups] = await Promise.all([
      prisma.pick.findMany({
        where: { leagueId, userId: targetUserId },
        include: { prop: { include: { player: { select: { name: true } }, game: { select: { gameDate: true, weekId: true } } } } },
        orderBy: { createdAt: "desc" },
      }),
      prisma.gamePick.findMany({
        where: { leagueId, userId: targetUserId },
        include: { gameLine: { include: { game: { select: { gameDate: true, weekId: true } } } } },
        orderBy: { createdAt: "desc" },
      }),
      prisma.parlay.findMany({
        where: { leagueId, userId: targetUserId },
        include: { legs: true },
        orderBy: { createdAt: "desc" },
      }),
      prisma.matchup.findMany({
        where: { leagueId, OR: [{ homeUserId: targetUserId }, { awayUserId: targetUserId }] },
      }),
    ]);

    function calcProfit(stake: number, odds: number, outcome: string): number {
      if (outcome === "WIN") return odds > 0 ? Math.round(stake * (odds / 100)) : Math.round(stake * (100 / Math.abs(odds)));
      if (outcome === "LOSS") return -stake;
      return 0;
    }

    const settledPicks = [...picks, ...gamePicks].filter((p) => p.outcome !== "PENDING");
    const allSettled = settledPicks.map((p) => ({ outcome: p.outcome, profit: calcProfit(p.stake, p.odds, p.outcome) }));

    let totalStaked = 0, totalProfit = 0, wonCount = 0, lostCount = 0;
    for (const p of [...picks, ...gamePicks, ...parlays]) {
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
    for (const p of picks) {
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
    for (const p of picks) {
      if (p.outcome === "PENDING") continue;
      const wid = p.prop.game.weekId;
      weekProfits[wid] = (weekProfits[wid] ?? 0) + calcProfit(p.stake, p.odds, p.outcome);
    }
    for (const p of gamePicks) {
      if (p.outcome === "PENDING") continue;
      const wid = p.gameLine.game.weekId;
      weekProfits[wid] = (weekProfits[wid] ?? 0) + calcProfit(p.stake, p.odds, p.outcome);
    }
    const weeksActive = Object.keys(weekProfits).length;
    const avgWeeklyWinnings = weeksActive > 0 ? Math.round(totalProfit / weeksActive) : 0;

    // Matchup record
    let wins = 0, losses = 0, ties = 0;
    for (const m of matchups) {
      if (!m.winnerId && !m.isTie) continue;
      if (m.isTie) { ties++; continue; }
      if (m.winnerId === targetUserId) wins++; else losses++;
    }

    // Rank
    const sorted = leaderboard
      .map((m) => m.userId)
      .sort(); // rough sort; real rank needs full leaderboard — just count members with higher balance
    const rank = leaderboard.filter((m) => m.balance > targetMembership.balance).length + 1;

    res.json({
      userId: targetUserId,
      displayName: (targetMembership as any).displayName || (targetMembership as any).user.displayName,
      balance: targetMembership.balance,
      rank,
      wins,
      losses,
      ties,
      totalPicks: picks.length + gamePicks.length + parlays.length,
      wonPicks: wonCount,
      lostPicks: lostCount,
      pendingPicks: picks.length + gamePicks.length + parlays.length - wonCount - lostCount,
      totalStaked,
      totalProfit,
      roi: totalStaked > 0 ? Math.round((totalProfit / totalStaked) * 1000) / 10 : 0,
      streak,
      avgWeeklyWinnings,
      bestStatType: statEntries[0] ? { statType: statEntries[0][0], profit: statEntries[0][1] } : null,
      worstStatType: statEntries.length > 1 ? { statType: statEntries[statEntries.length - 1][0], profit: statEntries[statEntries.length - 1][1] } : null,
      statTypeHitRates,
      recentPicks: picks.slice(0, 10).map((p) => ({
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

    const membership = await prisma.membership.findFirst({ where: { leagueId, userId: req.userId, status: "ACTIVE" } });
    if (!membership) { res.status(403).json({ error: "Not a member" }); return; }

    const week = await prisma.week.findFirst({
      where: weekNumber ? { number: weekNumber } : { resolved: true },
      orderBy: weekNumber ? undefined : { number: "desc" },
      include: { games: { select: { id: true } } },
    });
    if (!week?.resolved) { res.json(null); return; }

    const gameIds = week.games.map((g) => g.id);

    const [picks, gamePicks, parlays, matchups] = await Promise.all([
      prisma.pick.findMany({
        where: { leagueId, userId: req.userId, prop: { gameId: { in: gameIds } } },
        include: { prop: { include: { player: { select: { name: true } } } } },
      }),
      prisma.gamePick.findMany({
        where: { leagueId, userId: req.userId, gameLine: { gameId: { in: gameIds } } },
        include: { gameLine: true },
      }),
      prisma.parlay.findMany({
        where: { leagueId, userId: req.userId },
        include: { legs: { include: { prop: { include: { game: true } }, gameLine: { include: { game: true } } } } },
      }),
      prisma.matchup.findMany({
        where: { leagueId, weekNumber: week.number, OR: [{ homeUserId: req.userId }, { awayUserId: req.userId }] },
        include: {
          homeUser: { select: { displayName: true } },
          awayUser: { select: { displayName: true } },
        },
      }),
    ]);

    // Filter parlays to ones with at least one leg in this week's games
    const weekParlays = parlays.filter((p) =>
      p.legs.some((l) => gameIds.includes(l.prop?.game?.id ?? "") || gameIds.includes(l.gameLine?.game?.id ?? ""))
    );

    function calcProfit(stake: number, odds: number, outcome: string): number {
      if (outcome === "WIN") return odds > 0 ? Math.round(stake * (odds / 100)) : Math.round(stake * (100 / Math.abs(odds)));
      if (outcome === "LOSS") return -stake;
      return 0;
    }

    const allBets = [
      ...picks.map((p) => ({
        label: `${p.prop.player.name} ${p.direction} ${p.altLine ?? p.prop.line} ${p.prop.statType.split("_").join(" ")}`,
        stake: p.stake, odds: p.odds, outcome: p.outcome,
        profit: calcProfit(p.stake, p.odds, p.outcome),
      })),
      ...gamePicks.map((p) => ({
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

    const settled = allBets.filter((b) => b.outcome !== "PENDING");
    const bestBet = settled.sort((a, b) => b.profit - a.profit)[0] ?? null;
    const worstBet = settled.sort((a, b) => a.profit - b.profit)[0] ?? null;

    const matchup = matchups[0] ?? null;

    res.json({
      weekNumber: week.number,
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
