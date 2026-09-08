/**
 * The signed-in landing page.
 *
 * Three regions inside the content card — Inbox, the week, Friends — laid out
 * by components/HomeBoard, which is also where the reasoning about which of
 * them are cards lives.
 *
 * NO `.page-wide` WRAPPER, unlike every other page in the shell. Its padding
 * would inset the Inbox column from the card's left edge, and a flush column
 * with a hairline down its right side is the whole visual idea. HomeBoard
 * fills the card itself.
 *
 * Before this the page rendered `<div className="page-wide" />` — literally
 * nothing — and for a while that was worse than blank: the LeaguesRail that
 * used to sit here was the only mount for the join and create sheets, so
 * removing it took joining a league with it. Long fixed; the sheets live in
 * components/LeagueActions, mounted by SideNav, and work from every route.
 */
import HomeBoard from "@/components/HomeBoard";

export default function HomePage() {
  return <HomeBoard />;
}
