"use client";

/**
 * Friends — a destination in the sidebar with nothing behind it yet.
 *
 * It exists because SideNav lists it, and a nav item that 404s is worse than an
 * empty page: the first says the app is broken, the second says the feature is
 * not built. There is no friends model on the backend — no table, no route, no
 * concept of one user knowing another outside a league — so this page states
 * that rather than mocking up a list it cannot fill.
 *
 * When it is built, this is where it goes. The `.mx-*` vocabulary it already
 * uses is the same one My Account and the league editor are drawn in.
 */
export default function FriendsPage() {
  return (
    <div className="page-wide" style={{ paddingTop: "5vh" }}>
      <div className="mx-head">
        <h1 className="mx-title">Friends</h1>
      </div>
      <div className="mx-empty">
        Not built yet. For now, players find each other inside a league — invite
        someone with your league&rsquo;s code, or get matched into one from Home.
      </div>
    </div>
  );
}
