import { prisma } from "../src/db/prisma";
import { seedFakePropsForWeek } from "../src/services/fakeSync";

async function main() {
  // Upsert week 1
  const week = await prisma.week.upsert({
    where: { number: 1 },
    update: {},
    create: {
      number: 1,
      startDate: new Date("2025-09-04T00:00:00Z"),
      endDate:   new Date("2025-09-09T23:59:59Z"),
    },
    include: { games: true },
  });
  console.log(`Week 1 id: ${week.id}`);

  const GAMES = [
    { awayTeam: "BUF", homeTeam: "MIA", gameDate: new Date("2025-09-04T20:20:00Z") },
    { awayTeam: "LAR", homeTeam: "SF",  gameDate: new Date("2025-09-07T17:05:00Z") },
    { awayTeam: "GB",  homeTeam: "DET", gameDate: new Date("2025-09-07T20:20:00Z") },
  ];

  for (const g of GAMES) {
    const existing = week.games.find(
      (wg) => wg.awayTeam === g.awayTeam && wg.homeTeam === g.homeTeam
    );
    if (!existing) {
      await prisma.game.create({ data: { weekId: week.id, ...g, status: "SCHEDULED" } });
      console.log(`Created game: ${g.awayTeam} @ ${g.homeTeam}`);
    } else {
      console.log(`Game already exists: ${g.awayTeam} @ ${g.homeTeam}`);
    }
  }

  const result = await seedFakePropsForWeek(week.id);
  console.log(`Seeded: ${result.lines} lines, ${result.props} props`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
