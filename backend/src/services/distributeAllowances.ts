import { sql, eq } from "drizzle-orm";
import { db } from "../db/db";
import { weeks } from "../db/schema";

function rowsOf(r: any): any[] {
  return Array.isArray(r) ? r : (r?.rows ?? []);
}

// Resets balances to the weekly allowance in one statement, in the same
// transaction as the week's allowanceDistributed stamp, so a retry is safe.
// With a leagueId it pays only that league (season start) and doesn't stamp.
export async function distributeWeeklyAllowances(
  weekNumber: number,
  leagueId?: string,
): Promise<number> {
  return db.transaction(async (tx) => {
    // Only leagues whose own season covers this week.
    const paid = await tx.execute(sql`
      UPDATE "Membership" m
         SET balance = l."weeklyAllowance"
        FROM "League" l
       WHERE m."leagueId" = l.id
         AND m.status = 'ACTIVE'
         AND l."seasonStarted" = true
         AND l."seasonEnded" = false
         AND ${weekNumber} >= l."startWeek"
         AND ${weekNumber} <= l."startWeek" + l."regularSeasonWeeks" + l."playoffWeeks" - 1
         ${leagueId ? sql`AND l.id = ${leagueId}` : sql``}
       RETURNING m.id
    `);
    const count = rowsOf(paid).length;

    // Only the platform-wide run marks the week as paid.
    if (!leagueId) {
      await tx.update(weeks)
        .set({ allowanceDistributed: true })
        .where(eq(weeks.number, weekNumber));
    }

    console.log(
      `[allowances] Week ${weekNumber}${leagueId ? ` (league ${leagueId})` : ""} — ${count} members paid`
    );
    return count;
  });
}
