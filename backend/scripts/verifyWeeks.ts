import { db } from "../src/db/db";
import { asc, count, eq } from "drizzle-orm";
import { weeks, games, props } from "../src/db/schema";

async function main() {
  const allWeeks = await db.query.weeks.findMany({ orderBy: [asc(weeks.number)] });
  for (const w of allWeeks) {
    const weekGames = await db.query.games.findMany({ where: eq(games.weekId, w.id) });
    let totalProps = 0;
    for (const g of weekGames) {
      const [{ value }] = await db.select({ value: count() }).from(props).where(eq(props.gameId, g.id));
      totalProps += value;
    }
    const sample = weekGames[0]?.homeTeam ?? "-";
    console.log(`Week ${String(w.number).padStart(2)}: games=${weekGames.length} props=${totalProps} sample=${sample}`);
  }
}
main().catch(console.error).finally(() => process.exit(0));
