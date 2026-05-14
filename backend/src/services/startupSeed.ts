import { prisma } from "../db/prisma";
import { seedFakePropsForWeek } from "./fakeSync";

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

    // Find all unresolved weeks and seed any that are missing new stat types
    const unresolvedWeeks = await prisma.week.findMany({
      where: { resolved: false },
      include: { games: { include: { props: true } } },
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

      if (!hasNewProps) {
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
  } catch (err) {
    console.error("[seed] Startup seed failed:", err);
  }
}
