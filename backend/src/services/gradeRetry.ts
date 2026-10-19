// SGO finalizes grading a while after the game ends. Retry with backoff until
// it does; after 12h from kickoff, take whatever values it has.
export const GRADE_DEADLINE_MS = 12 * 60 * 60 * 1000;

const BACKOFF_MINUTES = [15, 15, 30, 60, 120, 240];

export function backoffMs(attemptsSoFar: number): number {
  const i = Math.min(Math.max(attemptsSoFar - 1, 0), BACKOFF_MINUTES.length - 1);
  return BACKOFF_MINUTES[i] * 60_000;
}

/** Past this, an event that is not `finalized` is graded from what it has. */
export function pastGradeDeadline(gameDate: Date, now: Date): boolean {
  return now.getTime() - new Date(gameDate).getTime() >= GRADE_DEADLINE_MS;
}

export class GradeAttempts {
  private seen = new Map<string, { count: number; nextAt: number }>();

  /** May this game be fetched now? True the first time and once its backoff has run. */
  due(gameId: string, now: Date): boolean {
    const s = this.seen.get(gameId);
    return !s || now.getTime() >= s.nextAt;
  }

  /** Note an attempt that did not settle the game. */
  record(gameId: string, now: Date): void {
    const count = (this.seen.get(gameId)?.count ?? 0) + 1;
    this.seen.set(gameId, { count, nextAt: now.getTime() + backoffMs(count) });
  }

  clear(gameId: string): void {
    this.seen.delete(gameId);
  }
}
