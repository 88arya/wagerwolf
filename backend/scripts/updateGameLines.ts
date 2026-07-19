import { db } from "../src/db/db";
import { weeks } from "../src/db/schema";
import { seedFakePropsForWeek } from "../src/services/fakeSync";

async function main() {
  const allWeeks = await db.query.weeks.findMany({ with: { games: true } });
  console.log(`Found ${allWeeks.length} weeks`);

  let totalLines = 0;
  for (const week of allWeeks) {
    if (!(week as any).games?.length) continue;
    const result = await seedFakePropsForWeek(week.id);
    totalLines += result.lines;
    console.log(`Week ${week.number}: updated ${result.lines} game lines, ${result.props} props`);
  }
  console.log(`Done. Total game lines updated: ${totalLines}`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
