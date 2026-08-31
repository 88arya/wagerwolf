/**
 * Global leaderboard — standings across every league, not scoped to one.
 *
 * Deliberately blank. The sidebar links here, so the route has to resolve
 * rather than 404; there is still no cross-league standings endpoint to render
 * from. Per-league standings live at /leagues/[leagueId]/leaderboard and are a
 * separate thing from this.
 */
export default function LeaderboardPage() {
  return <div className="page-wide" />;
}
