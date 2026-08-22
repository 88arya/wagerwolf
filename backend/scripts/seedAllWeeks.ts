import { db } from "../src/db/db";
import { eq, count } from "drizzle-orm";
import { weeks, games } from "../src/db/schema";
import { syncESPNGames } from "../src/services/syncWeek";

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

    // No invented fallback: a week ESPN has not published yet stays empty until
    // it does. Odds come separately, from scripts/seedRealProps.ts.
    const [{ value: gameCount }] = await db.select({ value: count() }).from(games).where(eq(games.weekId, week.id));
    if (gameCount === 0) console.log(`  No ESPN schedule yet — left empty`);
  }

  console.log("All weeks seeded.");
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
