import { Router } from "express";
import { db } from "../db/db";
import { PUBLIC_USER } from "../db/publicUser";
import { requireLeagueMember } from "../services/leagueAccess";
import { eq, and, asc, or, inArray, gte, lte } from "drizzle-orm";
import {
  leagues, memberships, weeks, matchups, users,
  games, props, picks, gameLines, gamePicks, parlays,
} from "../db/schema";
import { requireAuth } from "../middleware/auth";
import { generateLeagueName } from "../services/leagueName";
import { startLeagueSeason } from "../services/startSeason";
import { calcProfit, toDecimal } from "../lib/payout";
import { MAX_NFL_WEEK } from "../services/nflSeason";
import { nextStartWeek } from "../services/matchmaking";


async function ensureOpenPublicLeague(creatorId: string) {
  const open = await db.query.leagues.findFirst({
    where: and(eq(leagues.isPublic, true), eq(leagues.seasonStarted, false)),
    with: { memberships: true },
  }) as any;
  if (open && open.memberships.filter((m: any) => m.status === "ACTIVE").length < open.maxPlayers) return;

  const playoffSize = 6;
  const playoffWeeks = Math.ceil(Math.log2(playoffSize));
  const maxPlayers = 10;

  // Shared with quick-join and POST /leagues — see services/matchmaking.
  //
  // Two things went with the old version: an unordered `findFirst` on
  // `resolved = false` (so "first" was whatever Postgres returned), and a
  // `=== 1 ? 2 : n` special case that existed to avoid opening a league in a
  // week already under way. The date filter in `selectableStartWeeks` covers
  // that properly now — week 1 stops being offered once it kicks off, rather
  // than being skipped by name.
  const startWeek = await nextStartWeek();
  const regularSeasonWeeks = Math.max(1, MAX_NFL_WEEK - startWeek - playoffWeeks + 1);

  let inviteCode = Math.random().toString(36).substring(2, 8).toUpperCase();
  while (await db.query.leagues.findFirst({ where: eq(leagues.inviteCode, inviteCode) })) {
    inviteCode = Math.random().toString(36).substring(2, 8).toUpperCase();
  }

  await db.insert(leagues).values({
    name: generateLeagueName(),
    weeklyAllowance: 30000, // $300 in cents
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

router.post("/:leagueId/season/start", requireAuth, async (req: any, res: any, next: any) => {
  try {
    const { leagueId } = req.params;

    const league = await db.query.leagues.findFirst({
      where: eq(leagues.id, leagueId),
    });

    if (!league) { res.status(404).json({ error: "League not found" }); return; }
    if (league.creatorId !== req.userId) { res.status(403).json({ error: "Only the league creator can start the season" }); return; }
    if (league.seasonStarted) { res.status(400).json({ error: "Season already started" }); return; }

    const result = await startLeagueSeason(leagueId);

    // TOPPING THE POOL UP IS A SIDE EFFECT, AND MUST NOT FAIL THE START.
    //
    // `startLeagueSeason` has already committed above: matchups are scheduled,
    // `seasonStarted` is true and the first allowance is paid. A throw from
    // here reached the route's catch and answered 500, so the commissioner was
    // told their season had failed to start when in fact it had — and pressing
    // Start again would then 400 with "Season already started".
    //
    // `nextStartWeek` now throws when the schedule is exhausted rather than
    // silently returning a past week, which is what made this reachable.
    if (league.isPublic) {
      try {
        await ensureOpenPublicLeague(league.creatorId);
      } catch (err) {
        console.error("[season] Failed to open a replacement public league:", err);
      }
    }

    res.json(result);
  } catch (err: any) {
    if (err.message === "Need at least 2 members to start") {
      res.status(400).json({ error: err.message }); return;
    }
    next(err); return;
  }
});

router.get("/:leagueId/matchups", requireAuth, async (req: any, res: any, next: any) => {
  try {
    const { leagueId } = req.params;
    const { weekNumber } = req.query;
    // The schedule says who is playing whom, with per-league identity attached.
    // Members only.
    if (!(await requireLeagueMember(req, res, leagueId))) return;

    const whereClause = weekNumber
      ? and(eq(matchups.leagueId, leagueId), eq(matchups.weekNumber, Number(weekNumber)))
      : eq(matchups.leagueId, leagueId);

    const [matchupRows, membershipRows] = await Promise.all([
      db.query.matchups.findMany({
        where: whereClause,
        with: {
          homeUser: PUBLIC_USER,
          awayUser: PUBLIC_USER,
        },
        orderBy: [asc(matchups.weekNumber)],
      }),
      db.query.memberships.findMany({
        where: and(eq(memberships.leagueId, leagueId), eq(memberships.status, "ACTIVE")),
        with: { user: PUBLIC_USER },
      }),
    ]);

    // Per-league identity + balance live on Membership, not User. The strip's
    // matchups mode renders a helmet, an abbreviation and a balance per side,
    // so carry them through here rather than making the client join two lists.
    // Ghost opponents have no Membership row, hence the null-safe fallbacks.
    const memberMap: Record<string, any> = {};
    for (const m of membershipRows as any[]) {
      memberMap[m.userId] = {
        displayName: m.displayName || m.user.displayName,
        abbreviation: m.abbreviation,
        helmetColor: m.helmetColor,
        balance: m.balance,
      };
    }

    const withMember = (u: any) => {
      if (!u) return u;
      const mem = memberMap[u.id];
      return {
        ...u,
        displayName: mem?.displayName ?? u.displayName,
        abbreviation: mem?.abbreviation ?? null,
        helmetColor: mem?.helmetColor ?? null,
        balance: mem?.balance ?? null,
      };
    };

    const augmented = (matchupRows as any[]).map((mu) => ({
      ...mu,
      homeUser: withMember(mu.homeUser),
      awayUser: withMember(mu.awayUser),
    }));

    res.json(augmented);
  } catch (err: any) {
    next(err); return;
  }
});

function betEV(stake: number, odds: number): number {
  const impliedProb = 1 / toDecimal(odds);
  const profit = calcProfit(stake, odds);
  return impliedProb * (stake + profit);
}

function serializePick(p: any, reveal: boolean) {
  if (!reveal && p.outcome === "PENDING") {
    return { type: "pick" as const, id: p.id, outcome: p.outcome, stake: p.stake, odds: p.odds, hidden: true };
  }
  return {
    type: "pick" as const, id: p.id, outcome: p.outcome, cashedOut: p.cashedOut,
    stake: p.stake, odds: p.odds, direction: p.direction,
    line: p.altLine ?? p.prop?.line, statType: p.prop?.statType,
    playerName: p.prop?.player?.name, playerTeam: p.prop?.player?.team, playerPosition: p.prop?.player?.position,
    game: p.prop?.game ? { homeTeam: p.prop.game.homeTeam, awayTeam: p.prop.game.awayTeam, gameDate: p.prop.game.gameDate } : null,
    hidden: false,
  };
}

function serializeGamePick(g: any, reveal: boolean) {
  if (!reveal && g.outcome === "PENDING") {
    return { type: "gamepick" as const, id: g.id, outcome: g.outcome, stake: g.stake, odds: g.odds, hidden: true };
  }
  return {
    type: "gamepick" as const, id: g.id, outcome: g.outcome, cashedOut: g.cashedOut,
    stake: g.stake, odds: g.odds, label: g.gameLine?.label,
    game: g.gameLine?.game ? { homeTeam: g.gameLine.game.homeTeam, awayTeam: g.gameLine.game.awayTeam, gameDate: g.gameLine.game.gameDate } : null,
    hidden: false,
  };
}

function serializeParlay(p: any, reveal: boolean) {
  if (!reveal && p.outcome === "PENDING") {
    return { type: "parlay" as const, id: p.id, outcome: p.outcome, stake: p.stake, totalOdds: p.totalOdds, legCount: p.legs?.length ?? 0, hidden: true };
  }
  return {
    type: "parlay" as const, id: p.id, outcome: p.outcome, cashedOut: p.cashedOut,
    stake: p.stake, totalOdds: p.totalOdds, payout: p.payout,
    legs: (p.legs ?? []).map((l: any) => ({
      outcome: l.outcome, odds: l.odds,
      label: l.prop
        ? `${l.prop.player?.name} ${l.direction} ${l.altLine ?? l.prop.line} ${l.prop.statType}`
        : l.gameLine?.label ?? "—",
    })),
    hidden: false,
  };
}

// Current user's matchup for a week: opponent identity, available balance, and
// projected total (available balance + expected value of pending bets). The
// opponent's still-pending bets are masked so the user can't copy them before lock.
router.get("/:leagueId/matchup", requireAuth, async (req: any, res: any, next: any) => {
  try {
    const { leagueId } = req.params;
    const userId = req.userId;
    const { weekNumber: weekNumberQ } = req.query;
    if (!(await requireLeagueMember(req, res, leagueId))) return;

    const league = await db.query.leagues.findFirst({ where: eq(leagues.id, leagueId) });
    if (!league) { res.status(404).json({ error: "League not found" }); return; }

    let week;
    if (weekNumberQ) {
      week = await db.query.weeks.findFirst({ where: eq(weeks.number, Number(weekNumberQ)) });
    } else {
      const now = new Date();
      const maxWeek = league.startWeek + league.regularSeasonWeeks + league.playoffWeeks - 1;
      week = await db.query.weeks.findFirst({
        where: and(eq(weeks.resolved, false), gte(weeks.number, league.startWeek), lte(weeks.number, maxWeek)),
        orderBy: asc(weeks.number),
      });
    }
    if (!week) { res.json({ hasMatchup: false }); return; }

    const matchup = await db.query.matchups.findFirst({
      where: and(
        eq(matchups.leagueId, leagueId),
        eq(matchups.weekNumber, week.number),
        or(eq(matchups.homeUserId, userId), eq(matchups.awayUserId, userId)),
      ),
      with: { homeUser: PUBLIC_USER, awayUser: PUBLIC_USER },
    }) as any;
    if (!matchup) { res.json({ hasMatchup: false, weekNumber: week.number }); return; }

    const isBye = matchup.homeUserId === matchup.awayUserId;
    const opponentId = isBye ? null : (matchup.homeUserId === userId ? matchup.awayUserId : matchup.homeUserId);
    const relevantIds = isBye ? [userId] : [userId, opponentId as string];

    // Ghost user (odd member count filler) has no Membership row — fall back to the User row on the matchup
    const userRowByUid: Record<string, any> = {};
    if (matchup.homeUser) userRowByUid[matchup.homeUserId] = matchup.homeUser;
    if (matchup.awayUser) userRowByUid[matchup.awayUserId] = matchup.awayUser;
    function isGhost(uid: string) {
      return matchup.isGhostMatchup && userRowByUid[uid]?.email === "ghost@system.internal";
    }

    const [memberRows, allMatchups, weekGamesRows] = await Promise.all([
      db.query.memberships.findMany({
        where: and(eq(memberships.leagueId, leagueId), inArray(memberships.userId, relevantIds)),
        with: { user: PUBLIC_USER },
      }),
      db.query.matchups.findMany({ where: eq(matchups.leagueId, leagueId) }),
      db.select({ id: games.id }).from(games).where(eq(games.weekId, week.id)),
    ]);
    const memberMap: Record<string, any> = {};
    for (const m of memberRows as any[]) memberMap[m.userId] = m;

    function recordFor(uid: string) {
      let wins = 0, losses = 0, ties = 0;
      for (const mu of allMatchups as any[]) {
        if (mu.homeUserId !== uid && mu.awayUserId !== uid) continue;
        if (mu.homeUserId === mu.awayUserId) continue;
        if (mu.winnerId == null && !mu.isTie) continue;
        if (mu.isTie) ties++;
        else if (mu.winnerId === uid) wins++;
        else losses++;
      }
      return { wins, losses, ties };
    }

    const weekGameIds = weekGamesRows.map((g) => g.id);
    const weekGameIdSet = new Set(weekGameIds);

    const [weekProps, weekLines] = await Promise.all([
      weekGameIds.length > 0 ? db.select({ id: props.id }).from(props).where(inArray(props.gameId, weekGameIds)) : Promise.resolve([]),
      weekGameIds.length > 0 ? db.select({ id: gameLines.id }).from(gameLines).where(inArray(gameLines.gameId, weekGameIds)) : Promise.resolve([]),
    ]);
    const weekPropIds = weekProps.map((p) => p.id);
    const weekLineIds = weekLines.map((l) => l.id);

    async function fetchBets(uid: string) {
      const [pickRows, gamePickRows, parlayRows] = await Promise.all([
        weekPropIds.length > 0
          ? db.query.picks.findMany({
              where: and(eq(picks.userId, uid), eq(picks.leagueId, leagueId), inArray(picks.propId, weekPropIds)),
              with: { prop: { with: { player: true, game: true } } },
            })
          : Promise.resolve([]),
        weekLineIds.length > 0
          ? db.query.gamePicks.findMany({
              where: and(eq(gamePicks.userId, uid), eq(gamePicks.leagueId, leagueId), inArray(gamePicks.gameLineId, weekLineIds)),
              with: { gameLine: { with: { game: true } } },
            })
          : Promise.resolve([]),
        db.query.parlays.findMany({
          where: and(eq(parlays.userId, uid), eq(parlays.leagueId, leagueId)),
          with: { legs: { with: { prop: { with: { game: true, player: true } }, gameLine: { with: { game: true } } } } },
        }),
      ]);
      const weekParlayRows = (parlayRows as any[]).filter((p) =>
        p.legs.some((l: any) => {
          const gid = l.prop?.gameId ?? l.gameLine?.gameId;
          return gid && weekGameIdSet.has(gid);
        })
      );
      return { picks: pickRows as any[], gamePicks: gamePickRows as any[], parlays: weekParlayRows };
    }

    const [myBets, oppBets] = await Promise.all([
      fetchBets(userId),
      isBye ? Promise.resolve({ picks: [], gamePicks: [], parlays: [] }) : fetchBets(opponentId as string),
    ]);

    function pendingEV(bets: { picks: any[]; gamePicks: any[]; parlays: any[] }) {
      let ev = 0;
      for (const p of bets.picks) if (p.outcome === "PENDING") ev += betEV(p.stake, p.odds);
      for (const g of bets.gamePicks) if (g.outcome === "PENDING") ev += betEV(g.stake, g.odds);
      for (const pl of bets.parlays) {
        if (pl.outcome !== "PENDING") continue;
        const impliedProb = 1 / toDecimal(pl.totalOdds);
        ev += impliedProb * pl.payout;
      }
      return ev;
    }

    function buildSide(uid: string, bets: any, reveal: boolean) {
      const member = memberMap[uid];
      const ghost = isGhost(uid);
      const balance = member?.balance ?? 0;
      const projected = Math.round(balance + pendingEV(bets));
      const record = recordFor(uid);
      return {
        userId: uid,
        displayName: ghost ? "Ghost" : (member?.displayName || member?.user?.displayName || userRowByUid[uid]?.displayName || ""),
        helmetColor: ghost ? "#ffffff" : (member?.helmetColor ?? "#2563EB"),
        abbreviation: ghost ? "GH" : (member?.abbreviation ?? ""),
        wins: record.wins, losses: record.losses, ties: record.ties,
        balance,
        projected,
        bets: [
          ...bets.picks.map((p: any) => serializePick(p, reveal)),
          ...bets.gamePicks.map((g: any) => serializeGamePick(g, reveal)),
          ...bets.parlays.map((p: any) => serializeParlay(p, reveal)),
        ],
      };
    }

    res.json({
      hasMatchup: true,
      isBye,
      weekNumber: week.number,
      weeklyAllowance: league.weeklyAllowance,
      me: buildSide(userId, myBets, true),
      opponent: isBye ? null : buildSide(opponentId as string, oppBets, false),
    });
  } catch (err: any) {
    next(err); return;
  }
});

export default router;
