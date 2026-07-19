// Single source of truth for league standings: every ranking in the app
// (my-leagues table, leaderboard, member profile, playoff seeding) must use
// this tally + comparator so records and ranks never disagree between views.
// Ghost matchups count — the real member plays the league's mean weekly
// winnings and can genuinely win or lose (see resolveWeek.ts).

export type StandingRecord = { wins: number; losses: number; ties: number; balance: number };

type MatchupLike = {
  homeUserId: string;
  awayUserId: string;
  winnerId: string | null;
  isTie: boolean;
};

export function tallyRecords(
  members: Array<{ userId: string; balance: number }>,
  resolvedMatchups: MatchupLike[]
): Record<string, StandingRecord> {
  const records: Record<string, StandingRecord> = {};
  for (const m of members) records[m.userId] = { wins: 0, losses: 0, ties: 0, balance: m.balance };
  for (const mu of resolvedMatchups) {
    // Playoff byes are stored as self-matchups with winnerId set; counting one
    // would credit the member with a win AND a loss. Byes are not contests.
    if (mu.homeUserId === mu.awayUserId) continue;
    if (mu.isTie) {
      if (records[mu.homeUserId]) records[mu.homeUserId].ties++;
      if (records[mu.awayUserId]) records[mu.awayUserId].ties++;
    } else if (mu.winnerId) {
      const loserId = mu.winnerId === mu.homeUserId ? mu.awayUserId : mu.homeUserId;
      if (records[mu.winnerId]) records[mu.winnerId].wins++;
      if (records[loserId]) records[loserId].losses++;
    }
  }
  return records;
}

export function compareStandings(a: StandingRecord, b: StandingRecord): number {
  return b.wins - a.wins || b.ties - a.ties || b.balance - a.balance;
}
