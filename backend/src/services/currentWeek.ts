import { and, eq, gt, gte, lte, asc } from "drizzle-orm";
import { db } from "../db/db";
import { weeks } from "../db/schema";

// The week we're inside by date, else the next to start, else the first
// unresolved. Dates lead because `resolved` only says the batch job ran.
// Returns the steps rather than a row so each caller can pick its own columns.
// `now` is a JS Date, not SQL now(): the columns are timestamp without time
// zone and Postgres would convert using the session timezone.
export function currentWeekSteps(
  now: Date = new Date(),
  range?: { min: number; max: number },
): { where: any; orderBy: any }[] {
  const open = range
    ? and(eq(weeks.resolved, false), gte(weeks.number, range.min), lte(weeks.number, range.max))
    : eq(weeks.resolved, false);
  return [
    { where: and(open, lte(weeks.startDate, now), gte(weeks.endDate, now)), orderBy: asc(weeks.number) },
    { where: and(open, gt(weeks.startDate, now)), orderBy: asc(weeks.startDate) },
    { where: open, orderBy: asc(weeks.number) },
  ];
}

export async function currentWeek(now: Date = new Date()) {
  for (const step of currentWeekSteps(now)) {
    // Skip publicBoard, a large jsonb blob nobody here reads.
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
