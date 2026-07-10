import { db } from "../db/db";
import { eq, and, lte, inArray } from "drizzle-orm";
import { weeks, games, props, gameLines, leagues, memberships, players } from "../db/schema";
import { seedFakePropsForWeek, FAKE_PLAYERS } from "./fakeSync";
import { syncESPNGames } from "./syncWeek";
import { scheduleMatchups } from "./scheduleMatchups";
import { pickHelmetColor } from "./helmetColor";

const FAKE_GAMES: Array<{ homeTeam: string; awayTeam: string; offsetDays: number; hour: number }> = [
  { homeTeam: "KC",  awayTeam: "BUF", offsetDays: 3, hour: 13 },
  { homeTeam: "PHI", awayTeam: "DAL", offsetDays: 3, hour: 16 },
  { homeTeam: "SF",  awayTeam: "LAR", offsetDays: 3, hour: 16 },
  { homeTeam: "MIA", awayTeam: "CIN", offsetDays: 3, hour: 13 },
  { homeTeam: "BAL", awayTeam: "HOU", offsetDays: 3, hour: 13 },
  { homeTeam: "DET", awayTeam: "MIN", offsetDays: 3, hour: 13 },
  { homeTeam: "GB",  awayTeam: "ATL", offsetDays: 3, hour: 16 },
  { homeTeam: "PIT", awayTeam: "CLE", offsetDays: 3, hour: 20 },
  { homeTeam: "DAL", awayTeam: "WAS", offsetDays: 4, hour: 20 },
  { homeTeam: "TB",  awayTeam: "NO",  offsetDays: 1, hour: 20 },
];

const NEW_STAT_TYPES = new Set(["SACKS", "FIELD_GOALS_MADE", "TACKLES_ASSISTS", "PASSING_COMPLETIONS"]);

async function doRunStartupSeed() {
  const now = new Date();
  const base = new Date(now);
  base.setHours(0, 0, 0, 0);

  // Fetch unresolved weeks without nested relations to keep query small
  const unresolvedWeeks = await db.select().from(weeks).where(eq(weeks.resolved, false));

  // If no weeks exist at all, create one
  if (unresolvedWeeks.length === 0) {
    const end = new Date(base);
    end.setDate(end.getDate() + 6);
    end.setHours(23, 59, 59, 999);

    const lastWeek = await db.query.weeks.findFirst({
      where: undefined,
      orderBy: (w, { desc }) => [desc(w.number)],
    });
    const weekNumber = (lastWeek?.number ?? 0) + 1;
    const [week] = await db.insert(weeks)
      .values({ number: weekNumber, startDate: base, endDate: end })
      .returning();

    let synced = 0;
    try {
      ({ synced } = await syncESPNGames(week.id));
    } catch (e) {
      console.error(`[seed] ESPN sync failed for week ${weekNumber}:`, e);
    }

    if (synced === 0) {
      for (const g of FAKE_GAMES) {
        const gameDate = new Date(base);
        gameDate.setDate(gameDate.getDate() + g.offsetDays);
        gameDate.setHours(g.hour, 0, 0, 0);
        await db.insert(games).values({ weekId: week.id, homeTeam: g.homeTeam, awayTeam: g.awayTeam, gameDate });
      }
      const result = await seedFakePropsForWeek(week.id);
      console.log(`[seed] Created week ${weekNumber} with ${result.props} props`);
    }
    return;
  }

  // For each existing unresolved week, check with small queries if it needs seeding
  for (const week of unresolvedWeeks) {
    const weekGames = await db.select().from(games).where(eq(games.weekId, week.id));

    const needsGames = weekGames.length === 0;
    // Also re-sync if ALL existing games are fake (no espnId) — replace with real ESPN games
    const allFake = weekGames.length > 0 && weekGames.every(g => !g.espnId);
    if (needsGames || allFake) {
      let synced = 0;
      try {
        ({ synced } = await syncESPNGames(week.id));
      } catch (e) {
        console.error(`[seed] ESPN sync failed for week ${week.number}:`, e);
      }
      if (synced > 0) {
        console.log(`[seed] Synced ${synced} ESPN games for week ${week.number}`);
        continue;
      }
      if (needsGames) {
        // Fallback: fake games (only if week had no games at all)
        for (const g of FAKE_GAMES) {
          const gameDate = new Date(base);
          gameDate.setDate(gameDate.getDate() + g.offsetDays);
          gameDate.setHours(g.hour, 0, 0, 0);
          await db.insert(games).values({ weekId: week.id, homeTeam: g.homeTeam, awayTeam: g.awayTeam, gameDate });
        }
        const result = await seedFakePropsForWeek(week.id);
        console.log(`[seed] Seeded week ${week.number} (fake games): ${result.props} props`);
        continue;
      }
    }

    const gameIds = weekGames.map((g) => g.id);
    if (gameIds.length === 0) continue;

    // Check if week has new stat types
    const sampleNewProp = await db.query.props.findFirst({
      where: (p, { and, inArray }) => and(
        inArray(p.gameId, gameIds),
        inArray(p.statType, Array.from(NEW_STAT_TYPES) as any[]),
      ),
    });
    const hasNewProps = !!sampleNewProp;

    // Check if week has alt lines
    const sampleAltLine = await db.query.gameLines.findFirst({
      where: (gl, { and, inArray, like }) => and(
        inArray(gl.gameId, gameIds),
        like(gl.market, "ALT_%"),
      ),
    });
    const hasAltLines = !!sampleAltLine;

    // Check if any FAKE_PLAYER is missing props for this week
    const teamsInWeek = new Set(weekGames.flatMap((g) => [g.homeTeam, g.awayTeam]));
    const propPlayerIds = (await db.select({ playerId: props.playerId }).from(props).where(inArray(props.gameId, gameIds))).map(r => r.playerId);
    const playersWithProps = propPlayerIds.length > 0
      ? await db.select({ name: players.name }).from(players).where(inArray(players.id, propPlayerIds))
      : [];
    const namesWithProps = new Set(playersWithProps.map((p) => p.name));
    const missingPlayer = FAKE_PLAYERS.some((fp) => teamsInWeek.has(fp.team) && !namesWithProps.has(fp.name));

    if (!hasNewProps || !hasAltLines || missingPlayer) {
      const result = await seedFakePropsForWeek(week.id);
      console.log(`[seed] Seeded week ${week.number}: ${result.props} props`);
    }
  }

    // Repair unstarted leagues with ≥2 members but missing matchups
    const unstartedLeagues = await db.query.leagues.findMany({
      where: eq(leagues.seasonStarted, false),
      with: {
        memberships: true,
        matchups: true,
      },
    });

    for (const league of unstartedLeagues) {
      const activeMembers = (league.memberships as any[]).filter((m: any) => m.status === "ACTIVE");
      const regularMatchups = (league.matchups as any[]).filter(
        (m: any) => !m.isPlayoff && !m.isConsolation
      );
      if (activeMembers.length >= 2 && regularMatchups.length === 0) {
        await scheduleMatchups(league.id);
        console.log(`[seed] Repaired matchups for league ${league.id}`);
      }
    }

    // Fix duplicate helmet colors within leagues
    const allLeagues = await db.query.leagues.findMany();
    for (const league of allLeagues) {
      const members = await db.query.memberships.findMany({
        where: eq(memberships.leagueId, league.id),
        orderBy: (m, { asc }) => [asc(m.createdAt)],
      });
      const seen = new Set<string>();
      for (const m of members) {
        if (seen.has(m.helmetColor)) {
          const newColor = await pickHelmetColor(league.id);
          await db.update(memberships).set({ helmetColor: newColor }).where(eq(memberships.id, m.id));
          console.log(`[seed] Reassigned helmet color for membership ${m.id}: ${m.helmetColor} → ${newColor}`);
        } else {
          seen.add(m.helmetColor);
        }
      }
    }

    // Auto-start leagues whose autoStartAt has passed
    const leaguesToStart = await db.query.leagues.findMany({
      where: (l, { and, eq, lte, isNotNull }) =>
        and(eq(l.seasonStarted, false), isNotNull(l.autoStartAt), lte(l.autoStartAt, new Date())),
      with: { memberships: true },
    });

    for (const league of leaguesToStart) {
      const activeMembers = (league.memberships as any[]).filter((m: any) => m.status === "ACTIVE");
      if (activeMembers.length >= 2) {
        await scheduleMatchups(league.id);
        await db.update(leagues).set({ seasonStarted: true }).where(eq(leagues.id, league.id));
        console.log(`[seed] Auto-started league ${league.id}`);
      }
    }
}

export async function runStartupSeed() {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      await doRunStartupSeed();
      return;
    } catch (err: any) {
      const errStr = String(err?.message ?? "") + String(err?.cause?.message ?? "") + String(err?.cause?.code ?? "") + String(err?.code ?? "");
      const isConnErr = errStr.includes("terminated") || errStr.includes("ECONNREFUSED");
      if (attempt < 3 && isConnErr) {
        console.log(`[seed] Attempt ${attempt} failed (connection), retrying in 3s...`);
        await new Promise((r) => setTimeout(r, 3000));
      } else {
        console.error("[seed] Startup seed failed:", err);
        return;
      }
    }
  }
}
