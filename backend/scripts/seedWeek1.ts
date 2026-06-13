import { db } from "../src/db/db";
import { eq } from "drizzle-orm";
import { weeks, games } from "../src/db/schema";
import { seedFakePropsForWeek } from "../src/services/fakeSync";

async function main() {
  const existing = await db.query.weeks.findFirst({ where: eq(weeks.number, 1) });
  let week: { id: string; number: number; startDate: Date; endDate: Date };
  if (existing) {
    week = existing;
  } else {
    const [inserted] = await db.insert(weeks).values({
      number: 1,
      startDate: new Date("2025-09-04T00:00:00Z"),
      endDate: new Date("2025-09-09T23:59:59Z"),
    }).returning();
    week = inserted;
  }
  console.log(`Week 1 id: ${week.id}`);

  const GAMES = [
    { awayTeam: "BUF", homeTeam: "MIA", gameDate: new Date("2025-09-04T20:20:00Z") },
    { awayTeam: "LAR", homeTeam: "SF",  gameDate: new Date("2025-09-07T17:05:00Z") },
    { awayTeam: "GB",  homeTeam: "DET", gameDate: new Date("2025-09-07T20:20:00Z") },
  ];

  const existingGames = await db.query.games.findMany({ where: eq(games.weekId, week.id) });
  for (const g of GAMES) {
    const found = existingGames.find(wg => wg.awayTeam === g.awayTeam && wg.homeTeam === g.homeTeam);
    if (!found) {
      await db.insert(games).values({ weekId: week.id, ...g, status: "SCHEDULED" });
      console.log(`Created game: ${g.awayTeam} @ ${g.homeTeam}`);
    } else {
      console.log(`Game already exists: ${g.awayTeam} @ ${g.homeTeam}`);
    }
  }

  const result = await seedFakePropsForWeek(week.id);
  console.log(`Seeded: ${result.lines} lines, ${result.props} props`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
