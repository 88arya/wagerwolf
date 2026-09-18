import Link from "next/link";
import SupportLink from "@/components/SupportLink";
import type { SupportTopic } from "@/lib/support";
import Logo from "@/components/Logo";

/**
 * Global site footer. Mounted once by the root layout, inside .app-scroll and
 * after {children}, so it follows the page's content instead of pinning to the
 * viewport — see the .app-scroll and .page comments in globals.css for why the
 * scroll region had to move up a level for that to be possible.
 *
 * Renders on every route, the landing page included: that page used to end in a
 * footer of its own, which this replaces rather than stacks on top of.
 *
 * Deliberately outside LobbyGate. The gate hides league content until it knows
 * whether the season has started; the footer is chrome and has nothing to do
 * with that, so gating it would only make it flicker on every league
 * navigation.
 *
 * A server component — it is a list of links and a sentence, with hover living
 * in globals.css under .site-footer-link. Nothing here needs to run on the
 * client.
 */

/**
 * `href` navigates; `support: true` opens the support modal instead.
 *
 * The two support rows used to point at /contact, a page that no longer exists:
 * every contact control in the app is the same modal now, so a link here would
 * have been the one that still went somewhere. See components/SupportLink.
 */
/**
 * THE FIRST TWO COLUMNS MIRROR /docs — same groups, same order within them,
 * same names. That section's rail and its index both run Legal then Play, with
 * Legal as Terms of Service, Privacy Policy, Responsible Gaming; this said Play
 * then Legal, ordered Privacy before Terms, and was missing How It Works
 * entirely. Two orderings of one set of documents is one too many, and the
 * footer was the copy that had drifted.
 *
 * If a document is added under app/docs, add it here. Nothing enforces the
 * pairing — the rail is built from app/docs/layout.tsx's own list and this is a
 * second hand-written copy of it.
 *
 * "My Leagues" (-> /home) came out of Play. Play in /docs is two documents; a
 * link into the signed-in app is not one of them, and the footer only renders
 * on the marketing routes anyway, where the visitor may well have no leagues.
 */
const COLUMNS: Array<{
  heading: string;
  links: Array<{ label: string; href?: string; support?: SupportTopic }>;
}> = [
  {
    heading: "Legal",
    links: [
      { label: "Terms of Service", href: "/docs/terms-of-service" },
      { label: "Privacy Policy", href: "/docs/privacy-policy" },
      { label: "Responsible Gaming", href: "/docs/responsible-gaming" },
    ],
  },
  {
    heading: "Play",
    links: [
      { label: "How to Play", href: "/docs/how-to-play" },
      { label: "How It Works", href: "/docs/how-it-works" },
    ],
  },
  {
    heading: "Support",
    links: [
      // TITLE CASE, like every other label in this footer — "Terms of Service",
      // "How to Play". Minor words stay lower ("an", matching that "to" and
      // "of"), which is what keeps these from reading as two different
      // conventions in one column. The MODAL's own headings stay sentence case:
      // that is the in-app convention, the same one /settings uses for
      // "Personal information".
      //
      // One entry point, one inbox. There is no support backend — the row
      // composes a mailto: — so the SUBJECT LINE is the only thing that will
      // sort it once it arrives, which is what `support` carries here.
      //
      // NO "REPORT AN ISSUE" ROW. It was a second link into the same modal and
      // the same inbox, differing only in subject line; one Contact row covers
      // it, and the sender says what is wrong in the message either way.
      { label: "Contact Us", support: "contact" },
      // NO PASSWORD RESET ROW. There is no password: auth is Google-only, and
      // POST /users/auth/google is the entire login surface. The row pointed at
      // a flow that does not exist anywhere in the app. Add it back only
      // alongside real email/password sign-in.
      //
      // NO "CHANGE EMAIL ADDRESS" ROW EITHER, for the same reason one step on:
      // there is no change-email flow — PATCH /users/me takes displayName,
      // firstName and lastName only — and the email IS the Google account, so
      // changing it is something the user does at Google rather than here.
    ],
  },
];

/**
 * One row of the link columns.
 *
 * The element differs — most rows navigate and are <a>, Contact opens a dialog
 * and must be a <button>, since an <a> with no href is not focusable or
 * operable by keyboard — but the appearance must not. Both get the same single
 * class and `.site-footer-links` in globals.css draws them identically,
 * including hover.
 *
 * Written as a component rather than a ternary inside the map so that the "same
 * class, either element" rule has one place to live. It is the only thing
 * standing between the two elements looking the same and the global `button`
 * rule — a filled accent pill — reaching one of them.
 */
function FooterLink({ label, href, support }: { label: string; href?: string; support?: SupportTopic }) {
  if (support) {
    return <SupportLink className="site-footer-link" topic={support}>{label}</SupportLink>;
  }
  // A NEW TAB, matching SideNav's Docs row.
  //
  // Every `href` in COLUMNS above is a document under /docs, so this applies to
  // the documents and to nothing else; the Support column goes through
  // `support` and opens a dialog in place.
  //
  // The two entry points into the section disagreed until 18 Sept 2026. The
  // sidebar has always opened /docs in its own tab, and the reasoning is in
  // SideNav: the shell's Done button is `router.back()`, one press per document
  // read, so consulting three of them in the app's tab left three presses
  // between the reader and the game. The footer sent the same documents to the
  // current tab. Nothing regressed to cause that; the footer's links have been
  // `next/link` since the component was written, and the only `target="_blank"`
  // it ever carried belonged to the social icons.
  //
  // `rel` is stated even though the destination is same-origin. `noopener`
  // withholds the `window.opener` handle the opened page would otherwise get.
  return (
    <Link
      href={href!}
      className="site-footer-link"
      target="_blank"
      rel="noopener noreferrer"
    >
      {label}
    </Link>
  );
}

export default function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="site-footer-cols">
        {COLUMNS.map(({ heading, links }) => (
          <div key={heading}>
            <div className="site-footer-heading">{heading}</div>
            <div className="site-footer-links">
              {links.map((link) => <FooterLink key={link.label} {...link} />)}
            </div>
          </div>
        ))}
      </div>

      {/* The bottom bar. No rule across the top of it: the columns above end in
          whitespace and the mark below anchors the corner, so the line was
          drawing a boundary between two things that were not running into each
          other. Mark bottom left, fine print bottom right.

          THE MARK, NOT THE LOCKUP. LogoWordmark spells the name out, and the
          name is already at the top of every page in the utility bar; down here
          it is a sign-off rather than a label, so the wolf alone does the job at
          a size the wordmark could never carry.

          `bare` draws it in currentColor instead of on its accent tile — the
          same reason TopBar's is bare. A saturated square would be the only
          such thing on the dark fill.

          Year rendered on the server at request time. One that ticks over on
          its own beats one that has to be remembered every January. */}
      <div className="site-footer-rule">
        <Logo size={78} bare />
        <p className="site-footer-fine">© {new Date().getFullYear()} Wagerwolf</p>
      </div>
    </footer>
  );
}
