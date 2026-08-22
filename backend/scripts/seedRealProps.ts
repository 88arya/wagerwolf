/**
 * Pull real odds from SportsGameOdds and report what landed.
 *
 * Each event returned costs one entity against the monthly quota, so this is
 * deliberately scoped: pass a week and only that week is fetched.
 *
 *   npx tsx scripts/seedRealProps.ts --week=1
 *   npx tsx scripts/seedRealProps.ts            # every unresolved week (expensive)
 */
import { syncOdds, syncOddsAllWeeks } from "../src/services/syncWeek";
import { fetchUsage } from "../src/services/sportsGameOdds";
import { db } from "../src/db/db";
import { sql } from "drizzle-orm";

async function main() {
  const arg = process.argv.find((a) => a.startsWith("--week="));
  const weekNumber = arg ? Number(arg.split("=")[1]) : null;

  const before = await fetchUsage();
  console.log(`[quota] ${before.used}/${before.max} entities used before this run\n`);

  if (weekNumber != null) {
    const week = await db.query.weeks.findFirst({ where: (w, { eq }) => eq(w.number, weekNumber) });
    if (!week) { console.error(`Week ${weekNumber} not found`); process.exit(1); }
    const r = await syncOdds(week.id);
    console.log(`\n[sgo] week ${weekNumber}: ${r.games} games, ${r.lines} lines, ${r.props} props`);
  } else {
    const r = await syncOddsAllWeeks();
    console.log(`\n[sgo] ${r.weeks} weeks, ${r.games} games, ${r.lines} lines, ${r.props} props`);
  }

  const after = await fetchUsage();
  console.log(`[quota] ${after.used}/${after.max} used (+${after.used - before.used} this run)\n`);

  const byGame = await db.execute(sql`
    SELECT w.number AS wk,
           g."awayTeam" || '@' || g."homeTeam" AS matchup,
           g."externalId" IS NOT NULL AS has_event_id,
           count(DISTINCT gl.id) AS lines,
           count(DISTINCT p.id)  AS props,
           count(DISTINCT p."statType") AS stat_types
    FROM "Game" g
    JOIN "Week" w ON w.id = g."weekId"
    LEFT JOIN "GameLine" gl ON gl."gameId" = g.id
    LEFT JOIN "Prop" p ON p."gameId" = g.id
    GROUP BY w.number, matchup, has_event_id
    HAVING count(DISTINCT gl.id) + count(DISTINCT p.id) > 0
    ORDER BY w.number, matchup
  `);
  console.log("Board coverage:");
  console.table(byGame.rows);

  const byStat = await db.execute(sql`
    SELECT p."statType", count(*) AS props, count(DISTINCT p."gameId") AS games,
           count(*) FILTER (WHERE p."altLadder" IS NOT NULL) AS with_ladder,
           count(*) FILTER (WHERE p."oddID" IS NOT NULL) AS gradeable
    FROM "Prop" p GROUP BY 1 ORDER BY 2 DESC
  `);
  console.log("\nProps by stat type:");
  console.table(byStat.rows);

  process.exit(0);
}

main().catch((err) => { console.error(err); process.exit(1); });
