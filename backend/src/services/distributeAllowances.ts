import { sql, eq } from "drizzle-orm";
import { db } from "../db/db";
import { weeks } from "../db/schema";

function rowsOf(r: any): any[] {
  return Array.isArray(r) ? r : (r?.rows ?? []);
}

/**
 * Reset every eligible member's balance to their league's weekly allowance.
 *
 * ONE STATEMENT INSIDE ONE TRANSACTION, together with the stamp on
 * `Week.allowanceDistributed`. That atomicity is the whole point of the shape,
 * and it is what makes the caller safe to RETRY.
 *
 * It used to be a loop of single-row updates followed by a separate stamp
 * written by the caller, and the combination lost money in both directions:
 *
 *   - the scheduler's stamp only ran if the loop returned, so a failure partway
 *     left some leagues paid and the week unstamped. A retry then re-ran the
 *     whole loop and RESET THE BALANCES OF LEAGUES THAT HAD ALREADY SUCCEEDED,
 *     wiping any bet placed in between. Which is why the old code could not
 *     safely be retried, and so never was — see the note in scheduler.ts.
 *   - and if the loop succeeded but the stamp failed, the week stayed unstamped
 *     and the next run paid everyone twice.
 *
 * Now either the whole distribution and the stamp land, or neither does.
 *
 * SCOPED BY LEAGUE WHEN A LEAGUE IS NAMED, and this is not a convenience. A
 * season start needs to pay ONE league's members; it used to call the unscoped
 * version, which pays every league whose window contains that week — so one
 * commissioner pressing Start reset the balances of every other league playing
 * that week, mid-week. It then stamped the week globally, which made the
 * scheduler skip its own distribution for that week and left everyone else
 * unpaid. The scoped call writes no stamp, because it has not done the week's
 * work — only one league's share of it.
 */
export async function distributeWeeklyAllowances(
  weekNumber: number,
  leagueId?: string,
): Promise<number> {
  return db.transaction(async (tx) => {
    // The two week bounds are the league's OWN season, inlined rather than
    // computed in JS: its startWeek, and that plus its regular season plus its
    // playoffs. A league that has not reached this week, or is already past it,
    // is owed nothing.
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

    // ONLY THE UNSCOPED CALL STAMPS. See the header: the flag means "this week
    // has been paid out across the platform", which a one-league top-up has not
    // done. Stamping it there is what silently skipped everybody else.
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
