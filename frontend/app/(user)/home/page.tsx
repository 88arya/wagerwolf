/**
 * The signed-in landing page.
 *
 * Deliberately blank. The main column was already empty by choice — the space a
 * dashboard will go into — and the LeaguesRail that sat in the right-hand
 * column has been removed too, so the page is now an empty card.
 *
 * NOTE: SideNav's Leagues menu (Find a league / Use invite code / Create a
 * league) routed here expecting LeaguesRail to be mounted and to open the real
 * surface off lib/leagueActions. With the rail gone those three items have
 * nothing to open. See CLAUDE.md.
 */
export default function HomePage() {
  return <div className="page-wide" />;
}
