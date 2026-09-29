/**
 * WHEN TO ASK SGO FOR A GAME'S PROP RESULTS, and when to stop waiting.
 *
 * ESPN flips a game to FINAL within a minute of the whistle; SGO finishes
 * grading its markets some time after that. Grading used to fetch once at
 * FINAL and stamp the game settled whatever came back, so a feed that had not
 * caught up yet left props ungraded, and `voidUngradedProps` then refunded
 * every one of them as "Player did not play": winners lost their payout,
 * losers got their stake back, and nothing ever asked again.
 *
 * Now a fetch only counts when the event says `finalized`. Until then the game
 * is retried, on a backoff, because each fetch bills one entity and the score
 * sync calls in every minute. Typical lag costs one to three fetches; a feed
 * that never finalizes costs at most one per step below before the deadline.
 *
 * THE DEADLINE, 12 hours after kickoff, is when an unfinalized answer is taken
 * as it is. A game is over well inside that, so whatever values the event
 * carries are final in fact if not in flag, and without an end the bets on a
 * feed that never finalizes would stay pending for good. The week's own
 * deadline (`endDate`, last kickoff + 18h) is always later, so every game has
 * passed this one by the time the week is forced closed.
 *
 * Attempts live in process memory. A restart forgets them and retries at once,
 * which costs one fetch and is the right thing anyway.
 */
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
