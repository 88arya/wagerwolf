import { db } from "../db/db";
import { eq } from "drizzle-orm";
import { weeks, games, leagues, memberships } from "../db/schema";
import { syncESPNGames } from "./syncWeek";
import { scheduleMatchups } from "./scheduleMatchups";
import { pickHelmetColor } from "./helmetColor";

/**
 * Boot-time repair. Runs on every start and is idempotent.
 *
 * It used to also generate fake props and fake games, which is gone: the board
 * carries only what a sportsbook actually posted. A week with no ESPN schedule
 * yet simply has no games, and a game with no odds simply has no odds — both
 * are honest states, and neither is repaired by inventing numbers.
 *
 * Odds arrive from the SharpAPI sync (Wed/Fri cron, or scripts/seedRealProps.ts
 * by hand); schedules arrive from ESPN below.
 */
async function doRunStartupSeed() {
  const now = new Date();
  const base = new Date(now);
  base.setHours(0, 0, 0, 0);

  const unresolvedWeeks = await db.select().from(weeks).where(eq(weeks.resolved, false));

  // No weeks at all — stand one up and let ESPN fill in the schedule.
  if (unresolvedWeeks.length === 0) {
    const end = new Date(base);
    end.setDate(end.getDate() + 6);
    end.setHours(23, 59, 59, 999);

    const lastWeek = await db.query.weeks.findFirst({
      orderBy: (w, { desc }) => [desc(w.number)],
    });
    const weekNumber = (lastWeek?.number ?? 0) + 1;
    const [week] = await db.insert(weeks)
      .values({ number: weekNumber, startDate: base, endDate: end })
      .returning();

    try {
      const { synced } = await syncESPNGames(week.id);
      console.log(`[seed] Created week ${weekNumber} with ${synced} ESPN games`);
    } catch (e) {
      console.error(`[seed] ESPN sync failed for week ${weekNumber}:`, e);
    }
    return;
  }

  // Any unresolved week with no games gets one attempt at the ESPN schedule.
  for (const week of unresolvedWeeks) {
    const weekGames = await db.select({ id: games.id }).from(games).where(eq(games.weekId, week.id));
    if (weekGames.length > 0) continue;
    try {
      const { synced } = await syncESPNGames(week.id);
      if (synced > 0) console.log(`[seed] Synced ${synced} ESPN games for week ${week.number}`);
    } catch (e) {
      console.error(`[seed] ESPN sync failed for week ${week.number}:`, e);
    }
  }

  // Repair unstarted leagues with >= 2 members but missing matchups
  const unstartedLeagues = await db.query.leagues.findMany({
    where: eq(leagues.seasonStarted, false),
    with: { memberships: true, matchups: true },
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
