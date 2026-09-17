import { and, eq, gt, gte, lte, asc } from "drizzle-orm";
import { db } from "../db/db";
import { weeks } from "../db/schema";

/**
 * WHICH WEEK IS "NOW" — the one definition, for every surface that needs one.
 *
 * The week we are inside by date, else the next one to start, else the first
 * unresolved week at all. Four places had written this ladder out by hand
 * (`/weeks/public/current`, `/weeks?current=true`, `homePulse`, the landing
 * page's marquee) and a fifth used only the LAST step — `resolved = false`
 * ordered by number — which is a different question wearing the same name.
 *
 * THAT DIFFERENCE SHIPPED. On 16 Sept 2026 the Tuesday resolve had not carried
 * week 1 (see `scheduler.ts` — the cron fired 7h before its own predicate could
 * be true), so "first unresolved week" still meant week 1 while every date-based
 * caller had moved to week 2. The landing page showed week 2's fixtures in the
 * strip and week 1's board in the marquee under it.
 *
 * The lesson generalises past that one bug: `Week.resolved` is a JOB-COMPLETION
 * FLAG, not a clock. It says a batch ran, and a batch can be late, fail, or be
 * re-run. Anything asking "what week is it" must lead with the dates, which are
 * facts about the NFL, and use `resolved` only to exclude weeks already closed.
 *
 * STEPS, NOT A FETCH. Each caller wants a different projection — the public
 * route wants games plus two moneylines, the authenticated one wants every prop
 * and line, `homePulse` wants bare columns, the marquee wants nothing but an
 * id. Returning an id and making them all refetch would cost an extra round
 * trip everywhere; returning the ladder lets each spread its own `with` and
 * `columns` onto a shared predicate. Run them in order, stop at the first hit.
 *
 * `now` is a JS Date deliberately, NOT SQL `now()`. `Week.startDate`/`endDate`
 * are `timestamp` WITHOUT time zone, so Postgres would cast a timestamptz using
 * the SESSION's TimeZone — right only while that happens to be UTC. The rows
 * were written from JS Dates; comparing them to one is what makes this exact.
 */
export function currentWeekSteps(now: Date = new Date()): { where: any; orderBy: any }[] {
  return [
    {
      where: and(eq(weeks.resolved, false), lte(weeks.startDate, now), gte(weeks.endDate, now)),
      orderBy: asc(weeks.number),
    },
    { where: and(eq(weeks.resolved, false), gt(weeks.startDate, now)), orderBy: asc(weeks.startDate) },
    { where: eq(weeks.resolved, false), orderBy: asc(weeks.number) },
  ];
}

/**
 * The current week's row, default columns and no relations — for callers that
 * want the week itself rather than a tree hanging off it.
 */
export async function currentWeek(now: Date = new Date()) {
  for (const step of currentWeekSteps(now)) {
    // EVERY COLUMN EXCEPT `publicBoard`. That one holds the landing page's
    // frozen market sample — 48 kB of jsonb on a live week — and no caller of
    // this function reads it; they want `id`, `number` and `resolved`. Pulling
    // it dragged the whole board across on every /feed request and every /home
    // pulse. Drizzle reads an all-false `columns` map as "exclude these", so
    // the rest of the row still comes back and callers are unaffected.
    const week = await db.query.weeks.findFirst({ ...step, columns: { publicBoard: false } });
    if (week) return week;
  }
  return null;
}

/** Just the id. One column, for the landing page's board cache. */
export async function currentWeekId(now: Date = new Date()): Promise<string | null> {
  for (const step of currentWeekSteps(now)) {
    const week = await db.query.weeks.findFirst({ ...step, columns: { id: true } });
    if (week) return week.id;
  }
  return null;
}
