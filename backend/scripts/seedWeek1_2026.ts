import { prisma } from "../src/db/prisma";
import { seedFakePropsForWeek } from "../src/services/fakeSync";

const GAMES = [
  // TNF — Thu Sep 9 8:20 PM ET
  { awayTeam: "NE",  homeTeam: "SEA", gameDate: new Date("2026-09-10T00:20:00Z") },
  // International — Fri Sep 10 8:35 PM ET (Melbourne)
  { awayTeam: "SF",  homeTeam: "LAR", gameDate: new Date("2026-09-11T00:35:00Z") },
  // Sunday 1:00 PM ET
  { awayTeam: "TB",  homeTeam: "CIN", gameDate: new Date("2026-09-13T17:00:00Z") },
  { awayTeam: "NO",  homeTeam: "DET", gameDate: new Date("2026-09-13T17:00:00Z") },
  { awayTeam: "NYJ", homeTeam: "TEN", gameDate: new Date("2026-09-13T17:00:00Z") },
  { awayTeam: "BAL", homeTeam: "IND", gameDate: new Date("2026-09-13T17:00:00Z") },
  { awayTeam: "ATL", homeTeam: "PIT", gameDate: new Date("2026-09-13T17:00:00Z") },
  { awayTeam: "CHI", homeTeam: "CAR", gameDate: new Date("2026-09-13T17:00:00Z") },
  { awayTeam: "CLE", homeTeam: "JAX", gameDate: new Date("2026-09-13T17:00:00Z") },
  { awayTeam: "BUF", homeTeam: "HOU", gameDate: new Date("2026-09-13T17:00:00Z") },
  // Sunday 4:25 PM ET
  { awayTeam: "MIA", homeTeam: "LV",  gameDate: new Date("2026-09-13T20:25:00Z") },
  { awayTeam: "GB",  homeTeam: "MIN", gameDate: new Date("2026-09-13T20:25:00Z") },
  { awayTeam: "WSH", homeTeam: "PHI", gameDate: new Date("2026-09-13T20:25:00Z") },
  { awayTeam: "ARI", homeTeam: "LAC", gameDate: new Date("2026-09-13T20:25:00Z") },
  // SNF — Sun Sep 13 8:20 PM ET
  { awayTeam: "DAL", homeTeam: "NYG", gameDate: new Date("2026-09-14T00:20:00Z") },
  // MNF — Mon Sep 14 8:15 PM ET
  { awayTeam: "DEN", homeTeam: "KC",  gameDate: new Date("2026-09-15T00:15:00Z") },
];

async function main() {
  console.log("Clearing existing data...");

  await prisma.parlayLeg.deleteMany({});
  await prisma.parlay.deleteMany({});
  await prisma.pick.deleteMany({});
  await prisma.gamePick.deleteMany({});
  await prisma.prop.deleteMany({});
  await prisma.gameLine.deleteMany({});
  await prisma.game.deleteMany({});
  await prisma.week.deleteMany({});

  console.log("All weeks/games/props/lines cleared.");

  // Reset all leagues to start from week 1
  await prisma.league.updateMany({ data: { startWeek: 1 } });
  console.log("Reset all leagues to startWeek = 1.");

  const week = await prisma.week.create({
    data: {
      number: 1,
      startDate: new Date("2026-09-09T00:00:00Z"),
      endDate:   new Date("2026-09-15T23:59:59Z"),
    },
  });
  console.log(`Created Week 1 — id: ${week.id}`);

  for (const g of GAMES) {
    await prisma.game.create({ data: { weekId: week.id, ...g, status: "SCHEDULED" } });
    console.log(`  Created: ${g.awayTeam} @ ${g.homeTeam}`);
  }

  console.log("Seeding fake props and lines...");
  const result = await seedFakePropsForWeek(week.id);
  console.log(`Done — ${result.lines} lines, ${result.props} props`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
