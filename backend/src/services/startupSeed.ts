import { db } from "../db/db";
import { eq, and, lte } from "drizzle-orm";
import { weeks, games, leagues, memberships } from "../db/schema";
import { seedFakePropsForWeek, FAKE_PLAYERS } from "./fakeSync";
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

export async function runStartupSeed() {
  try {
    const now = new Date();
    const base = new Date(now);
    base.setHours(0, 0, 0, 0);

    // Find all unresolved weeks and seed any that are missing new stat types or alt lines
    const unresolvedWeeks = await db.query.weeks.findMany({
      where: eq(weeks.resolved, false),
      with: { games: { with: { props: true, gameLines: true } } },
    });

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
      for (const g of FAKE_GAMES) {
        const gameDate = new Date(base);
        gameDate.setDate(gameDate.getDate() + g.offsetDays);
        gameDate.setHours(g.hour, 0, 0, 0);
        await db.insert(games).values({ weekId: week.id, homeTeam: g.homeTeam, awayTeam: g.awayTeam, gameDate });
      }
      const result = await seedFakePropsForWeek(week.id);
      console.log(`[seed] Created week ${weekNumber} with ${result.props} props`);
      return;
    }

    // For each existing unresolved week, ensure it has new prop types
    for (const week of unresolvedWeeks) {
      const weekGames = (week as any).games as any[];
      const hasNewProps = weekGames.some((g: any) =>
        (g.props as any[]).some((p: any) => NEW_STAT_TYPES.has(p.statType as string))
      );
      const hasAltLines = weekGames.some((g: any) =>
        (g.gameLines as any[]).some((l: any) => (l.market as string).startsWith("ALT_"))
      );

      // Check if any team in the week has a FAKE_PLAYER with no prop yet
      const teamsInWeek = new Set(weekGames.flatMap((g: any) => [g.homeTeam, g.awayTeam]));
      const playersWithProps = await db.query.players.findMany({
        where: (pl, { inArray }) =>
          inArray(
            pl.id,
            // sub-select: get player IDs that have props for these games
            weekGames.flatMap((g: any) => (g.props as any[]).map((p: any) => p.playerId))
          ),
      });
      const namesWithProps = new Set(playersWithProps.map((p) => p.name));
      const missingPlayer = FAKE_PLAYERS.some((fp) => teamsInWeek.has(fp.team) && !namesWithProps.has(fp.name));

      if (!hasNewProps || !hasAltLines || missingPlayer) {
        // Add games if the week has none
        if (weekGames.length === 0) {
          for (const g of FAKE_GAMES) {
            const gameDate = new Date(base);
            gameDate.setDate(gameDate.getDate() + g.offsetDays);
            gameDate.setHours(g.hour, 0, 0, 0);
            await db.insert(games).values({ weekId: week.id, homeTeam: g.homeTeam, awayTeam: g.awayTeam, gameDate });
          }
        }
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
  } catch (err) {
    console.error("[seed] Startup seed failed:", err);
  }
}
