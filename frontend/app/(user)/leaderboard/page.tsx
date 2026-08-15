/**
 * Global leaderboard — standings across every league, not scoped to one.
 *
 * Placeholder. The utility bar links here, so the route has to resolve rather
 * than 404; there is no cross-league standings endpoint yet to render from.
 * Per-league standings already exist at /leagues/[leagueId]/leaderboard and are
 * a separate thing from this.
 */
export default function LeaderboardPage() {
  return (
    <div className="page-wide" style={{ paddingTop: "5vh" }}>
      <h1 className="display" style={{ fontSize: "1.7rem", margin: 0 }}>Leaderboard</h1>
      <p style={{ color: "var(--text-2)", fontSize: "0.9rem", marginTop: 10 }}>
        Global standings across every league. Not built yet.
      </p>
    </div>
  );
}
