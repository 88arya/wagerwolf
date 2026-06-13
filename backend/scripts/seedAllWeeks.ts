import { db } from "../src/db/db";
import { eq, count } from "drizzle-orm";
import { weeks, games } from "../src/db/schema";
import { syncESPNGames } from "../src/services/syncWeek";
import { seedFakePropsForWeek } from "../src/services/fakeSync";

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

async function main() {
  const fromArg = process.argv.find((a) => a.startsWith("--from="));
  const fromWeek = fromArg ? parseInt(fromArg.split("=")[1]) : 2;

  const week1 = await db.query.weeks.findFirst({ where: eq(weeks.number, 1) });
  if (!week1) { console.error("Week 1 not found"); process.exit(1); }

  const week1Start = new Date(week1.startDate);

  for (let weekNum = fromWeek; weekNum <= 17; weekNum++) {
    const startDate = new Date(week1Start);
    startDate.setUTCDate(week1Start.getUTCDate() + 7 * (weekNum - 1));

    const endDate = new Date(startDate);
    endDate.setUTCDate(startDate.getUTCDate() + 6);
    endDate.setUTCHours(23, 59, 59, 999);

    const existing = await db.query.weeks.findFirst({ where: eq(weeks.number, weekNum) });
    let week: typeof existing & { id: string };
    if (existing) {
      week = existing;
    } else {
      const [inserted] = await db.insert(weeks).values({ number: weekNum, startDate, endDate }).returning();
      week = inserted;
    }

    console.log(`Week ${weekNum}: ${startDate.toISOString().slice(0, 10)} – ${endDate.toISOString().slice(0, 10)}`);

    const [{ value: existingCount }] = await db.select({ value: count() }).from(games).where(eq(games.weekId, week.id));
    if (existingCount === 0) {
      try {
        const result = await syncESPNGames(week.id);
        console.log(`  ESPN: ${result.synced} games synced`);
      } catch (err) {
        console.error(`  ESPN sync failed:`, (err as Error).message);
      }
    } else {
      console.log(`  Skipped (${existingCount} games already exist)`);
    }

    const [{ value: gameCount }] = await db.select({ value: count() }).from(games).where(eq(games.weekId, week.id));
    if (gameCount === 0) {
      for (const g of FAKE_GAMES) {
        const gameDate = new Date(startDate);
        gameDate.setUTCDate(startDate.getUTCDate() + g.offsetDays);
        gameDate.setUTCHours(g.hour, 0, 0, 0);
        await db.insert(games).values({ weekId: week.id, homeTeam: g.homeTeam, awayTeam: g.awayTeam, gameDate });
      }
      const result = await seedFakePropsForWeek(week.id);
      console.log(`  Fake fallback: ${FAKE_GAMES.length} games, ${result.props} props`);
    }
  }

  console.log("All weeks seeded.");
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
