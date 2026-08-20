import "dotenv/config";
import { sql } from "drizzle-orm";
import { db } from "../src/db/db";

/**
 * One-time backfill for League.activeMemberCount / activePublicFillCount.
 *
 * Every league that existed before those columns did has them sitting at the
 * column default of 0, which reads as "completely empty" — so a full league
 * would happily accept members and discovery would rank it as the emptiest
 * thing available. Nothing may read the counters until this has run.
 *
 * Idempotent, and safe to re-run any time a count is suspected of drifting:
 * it recomputes from the Membership rows rather than adjusting by a delta.
 * Same logic as recountSeats() in services/leagueSeats.ts, done set-wise in
 * one statement instead of per league.
 *
 *   npx tsx scripts/backfillMemberCounts.ts
 */
async function main() {
  const before = await db.execute(sql`
    SELECT count(*)::int AS mismatched
    FROM "League" l
    LEFT JOIN (
      SELECT "leagueId",
             count(*) FILTER (WHERE status = 'ACTIVE')::int AS active,
             count(*) FILTER (WHERE status = 'ACTIVE' AND "isPublicFill")::int AS fill
      FROM "Membership"
      GROUP BY "leagueId"
    ) m ON m."leagueId" = l.id
    WHERE l."activeMemberCount" IS DISTINCT FROM COALESCE(m.active, 0)
       OR l."activePublicFillCount" IS DISTINCT FROM COALESCE(m.fill, 0)
  `);
  const mismatched = (before.rows[0] as any)?.mismatched ?? 0;

  const result = await db.execute(sql`
    UPDATE "League" l
    SET "activeMemberCount"     = COALESCE(m.active, 0),
        "activePublicFillCount" = COALESCE(m.fill, 0)
    FROM (SELECT id FROM "League") AS all_leagues
    LEFT JOIN (
      SELECT "leagueId",
             count(*) FILTER (WHERE status = 'ACTIVE')::int AS active,
             count(*) FILTER (WHERE status = 'ACTIVE' AND "isPublicFill")::int AS fill
      FROM "Membership"
      GROUP BY "leagueId"
    ) m ON m."leagueId" = all_leagues.id
    WHERE l.id = all_leagues.id
  `);

  console.log(`[backfill] ${mismatched} league(s) had drifted counts; ${result.rowCount ?? 0} row(s) rewritten.`);

  const sample = await db.execute(sql`
    SELECT name, "activeMemberCount", "activePublicFillCount", "maxPlayers"
    FROM "League" ORDER BY "createdAt" DESC LIMIT 8
  `);
  for (const r of sample.rows as any[]) {
    console.log(`  ${r.activeMemberCount}/${r.maxPlayers} (fill ${r.activePublicFillCount})  ${r.name}`);
  }
  process.exit(0);
}

main().catch((err) => {
  console.error("[backfill] failed:", err);
  process.exit(1);
});
