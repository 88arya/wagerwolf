import { prisma } from "../db/prisma";
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
    const unresolvedWeeks = await prisma.week.findMany({
      where: { resolved: false },
      include: { games: { include: { props: true, gameLines: true } } },
    });

    // If no weeks exist at all, create one
    if (unresolvedWeeks.length === 0) {
      const end = new Date(base);
      end.setDate(end.getDate() + 6);
      end.setHours(23, 59, 59, 999);
      const lastWeek = await prisma.week.findFirst({ orderBy: { number: "desc" } });
      const weekNumber = (lastWeek?.number ?? 1);
      const week = await prisma.week.create({
        data: { number: weekNumber, startDate: base, endDate: end },
      });
      for (const g of FAKE_GAMES) {
        const gameDate = new Date(base);
        gameDate.setDate(gameDate.getDate() + g.offsetDays);
        gameDate.setHours(g.hour, 0, 0, 0);
        await prisma.game.create({
          data: { weekId: week.id, homeTeam: g.homeTeam, awayTeam: g.awayTeam, gameDate },
        });
      }
      const result = await seedFakePropsForWeek(week.id);
      console.log(`[seed] Created week ${weekNumber} with ${result.props} props`);
      return;
    }

    // For each existing unresolved week, ensure it has new prop types
    for (const week of unresolvedWeeks) {
      const hasNewProps = week.games.some((g) =>
        g.props.some((p) => NEW_STAT_TYPES.has(p.statType as string))
      );
      const hasAltLines = week.games.some((g) =>
        g.gameLines.some((l) => (l.market as string).startsWith("ALT_"))
      );

      // Check if any team in the week has a FAKE_PLAYER with no prop yet
      const teamsInWeek = new Set(week.games.flatMap((g) => [g.homeTeam, g.awayTeam]));
      const playersWithProps = await prisma.player.findMany({
        where: { props: { some: { gameId: { in: week.games.map((g) => g.id) } } } },
        select: { name: true },
      });
      const namesWithProps = new Set(playersWithProps.map((p) => p.name));
      const missingPlayer = FAKE_PLAYERS.some((fp) => teamsInWeek.has(fp.team) && !namesWithProps.has(fp.name));

      if (!hasNewProps || !hasAltLines || missingPlayer) {
        // Add games if the week has none
        if (week.games.length === 0) {
          for (const g of FAKE_GAMES) {
            const gameDate = new Date(base);
            gameDate.setDate(gameDate.getDate() + g.offsetDays);
            gameDate.setHours(g.hour, 0, 0, 0);
            await prisma.game.create({
              data: { weekId: week.id, homeTeam: g.homeTeam, awayTeam: g.awayTeam, gameDate },
            });
          }
        }
        const result = await seedFakePropsForWeek(week.id);
        console.log(`[seed] Seeded week ${week.number}: ${result.props} props`);
      }
    }
    // Repair unstarted leagues with ≥2 members but missing matchups
    const unstartedLeagues = await prisma.league.findMany({
      where: { seasonStarted: false },
      include: {
        memberships: { where: { status: "ACTIVE" }, select: { id: true } },
        matchups: { where: { isPlayoff: false, isConsolation: false }, select: { id: true }, take: 1 },
      },
    }) as any[];

    for (const league of unstartedLeagues) {
      if (league.memberships.length >= 2 && league.matchups.length === 0) {
        await scheduleMatchups(league.id);
        console.log(`[seed] Repaired matchups for league ${league.id}`);
      }
    }

    // Fix duplicate helmet colors within leagues
    const allLeagues = await prisma.league.findMany({ select: { id: true } });
    for (const league of allLeagues) {
      const members = await prisma.membership.findMany({
        where: { leagueId: league.id },
        select: { id: true, helmetColor: true },
        orderBy: { createdAt: "asc" },
      });
      const seen = new Set<string>();
      for (const m of members) {
        if (seen.has(m.helmetColor)) {
          const newColor = await pickHelmetColor(league.id);
          await prisma.membership.update({ where: { id: m.id }, data: { helmetColor: newColor } });
          console.log(`[seed] Reassigned helmet color for membership ${m.id}: ${m.helmetColor} → ${newColor}`);
        } else {
          seen.add(m.helmetColor);
        }
      }
    }

    // Auto-start leagues whose autoStartAt has passed
    const leaguesToStart = await prisma.league.findMany({
      where: { autoStartAt: { lte: new Date() }, seasonStarted: false },
      include: { memberships: { where: { status: "ACTIVE" }, select: { id: true } } },
    }) as any[];

    for (const league of leaguesToStart) {
      if (league.memberships.length >= 2) {
        await scheduleMatchups(league.id);
        await prisma.league.update({ where: { id: league.id }, data: { seasonStarted: true } });
        console.log(`[seed] Auto-started league ${league.id}`);
      }
    }
  } catch (err) {
    console.error("[seed] Startup seed failed:", err);
  }
}
