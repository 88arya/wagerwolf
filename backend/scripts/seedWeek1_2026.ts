import { db } from "../src/db/db";
import { eq } from "drizzle-orm";
import { weeks, games, leagues } from "../src/db/schema";
import { parlayLegs, parlays, picks, gamePicks, props, gameLines } from "../src/db/schema";
import { seedFakePropsForWeek } from "../src/services/fakeSync";

const GAMES = [
  { awayTeam: "NE",  homeTeam: "SEA", gameDate: new Date("2026-09-10T00:20:00Z") },
  { awayTeam: "SF",  homeTeam: "LAR", gameDate: new Date("2026-09-11T00:35:00Z") },
  { awayTeam: "TB",  homeTeam: "CIN", gameDate: new Date("2026-09-13T17:00:00Z") },
  { awayTeam: "NO",  homeTeam: "DET", gameDate: new Date("2026-09-13T17:00:00Z") },
  { awayTeam: "NYJ", homeTeam: "TEN", gameDate: new Date("2026-09-13T17:00:00Z") },
  { awayTeam: "BAL", homeTeam: "IND", gameDate: new Date("2026-09-13T17:00:00Z") },
  { awayTeam: "ATL", homeTeam: "PIT", gameDate: new Date("2026-09-13T17:00:00Z") },
  { awayTeam: "CHI", homeTeam: "CAR", gameDate: new Date("2026-09-13T17:00:00Z") },
  { awayTeam: "CLE", homeTeam: "JAX", gameDate: new Date("2026-09-13T17:00:00Z") },
  { awayTeam: "BUF", homeTeam: "HOU", gameDate: new Date("2026-09-13T17:00:00Z") },
  { awayTeam: "MIA", homeTeam: "LV",  gameDate: new Date("2026-09-13T20:25:00Z") },
  { awayTeam: "GB",  homeTeam: "MIN", gameDate: new Date("2026-09-13T20:25:00Z") },
  { awayTeam: "WSH", homeTeam: "PHI", gameDate: new Date("2026-09-13T20:25:00Z") },
  { awayTeam: "ARI", homeTeam: "LAC", gameDate: new Date("2026-09-13T20:25:00Z") },
  { awayTeam: "DAL", homeTeam: "NYG", gameDate: new Date("2026-09-14T00:20:00Z") },
  { awayTeam: "DEN", homeTeam: "KC",  gameDate: new Date("2026-09-15T00:15:00Z") },
];

async function main() {
  console.log("Clearing existing data...");

  await db.delete(parlayLegs);
  await db.delete(parlays);
  await db.delete(picks);
  await db.delete(gamePicks);
  await db.delete(props);
  await db.delete(gameLines);
  await db.delete(games);
  await db.delete(weeks);

  console.log("All weeks/games/props/lines cleared.");

  await db.update(leagues).set({ startWeek: 1 });
  console.log("Reset all leagues to startWeek = 1.");

  const [week] = await db.insert(weeks).values({
    number: 1,
    startDate: new Date("2026-09-09T00:00:00Z"),
    endDate: new Date("2026-09-15T23:59:59Z"),
  }).returning();
  console.log(`Created Week 1 — id: ${week.id}`);

  for (const g of GAMES) {
    await db.insert(games).values({ weekId: week.id, ...g, status: "SCHEDULED" });
    console.log(`  Created: ${g.awayTeam} @ ${g.homeTeam}`);
  }

  console.log("Seeding fake props and lines...");
  const result = await seedFakePropsForWeek(week.id);
  console.log(`Done — ${result.lines} lines, ${result.props} props`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
