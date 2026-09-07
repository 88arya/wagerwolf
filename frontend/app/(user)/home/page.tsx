/**
 * The signed-in landing page.
 *
 * Deliberately blank, and now blank for one reason rather than two. The main
 * column was always empty by choice — the space a dashboard will go into — and
 * the LeaguesRail that sat in the right-hand column has been removed.
 *
 * Removing the rail used to take joining and creating a league with it: the
 * sidebar's Leagues menu recorded an intent and routed here expecting the rail
 * to open the real surface, so with the rail gone those three rows opened
 * nothing at all. That is fixed and it is no longer this page's problem — the
 * sheets live in components/LeagueActions, which SideNav mounts directly, so
 * all three work from every route. See CLAUDE.md -> Finish the frontend.
 *
 * What is left here is the dashboard, and only the dashboard.
 */
export default function HomePage() {
  return <div className="page-wide" />;
}
