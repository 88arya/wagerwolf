/**
 * Friends — a destination in the sidebar with nothing behind it yet.
 *
 * Deliberately blank. It exists because SideNav lists it, and a nav item that
 * 404s is worse than an empty page. There is still no friends model on the
 * backend — no table, no route, no concept of one user knowing another outside
 * a league.
 */
export default function FriendsPage() {
  return <div className="page-wide" />;
}
