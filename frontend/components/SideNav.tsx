"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown, Home, Shield, Users } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { api } from "@/lib/api";
import AccountMenu from "@/components/AccountMenu";
import LogoWordmark from "@/components/LogoWordmark";
import SideNavGames from "@/components/SideNavGames";
import UserIcon from "@/components/UserIcon";

/**
 * The signed-in app's nav: a sidebar standing on the page ground, with the card
 * beside it holding whatever it selected. See the `.app-shell` block in
 * globals.css for the layout and components/AppFrame for which routes get it.
 *
 * TWO COMPONENTS AND NOTHING ELSE.
 *
 *   Label   — one destination: an icon and a name. Home is a label. So is a
 *             league. Every label is drawn identically — same box, same
 *             alignment, same size and weight — because a league is not a
 *             lesser kind of destination than Home. Only the icon differs.
 *   Section — a group of labels, with a title above them. Titles are sentence
 *             case, not the app's uppercase micro-label; a section here names a
 *             group you can click, not a field.
 *
 * LABELS LIVE INSIDE SECTIONS, including Home and Friends — theirs is the one
 * section with no title. A titleless section has nothing to click and so cannot
 * collapse, which is right for the two destinations that are not a league.
 *
 * COLLAPSING. A titled section carries a caret: down while its labels show,
 * flipped when they do not, and clicking the title toggles. The labels are
 * unmounted rather than hidden, so a collapsed league list costs nothing.
 *
 * The state is in memory and survives navigation — SideNav is mounted once by
 * AppFrame in the root layout and never remounts — but not a reload. That is
 * deliberate: persisting it would mean the localStorage-plus-module-variable
 * dance the games strip uses for its own preferences (see the note on
 * COLLAPSED_KEY there), and a nav that comes back open is a smaller surprise
 * than one that comes back closed with no sign of what is missing.
 *
 * WHAT IT REPLACED. Navigation used to be three bars stacked down the top of
 * every page — the utility bar (lockup + account), SiteNav, and LeagueNav —
 * plus a games strip between them. The first two are gone on these routes;
 * everything they carried is here.
 *
 * "GAMES" shipped as an empty title, deliberately, and now holds the NFL week —
 * see components/SideNavGames. It is a list of fixtures, not the games strip
 * brought back: no odds, no cards, no motion.
 *
 * LeagueNav is NOT replaced. Picking a league here goes to that league's home;
 * its own tabs (Bet, My Bets, and the rest) stay a row inside the card, which
 * is what keeps every existing league route working unchanged.
 */

// Matches the lockup in BarePageHeader rather than the utility bar's 20 — this
// is the mark's only appearance on a signed-in page now, so it is not being
// squeezed into a 40px bar any more.
const LOCKUP_H = 22;

// One size for every label's icon, so the names after them all start on the
// same vertical. 15px against a 0.82rem label is the pairing the rows are built
// around; changing it moves the text column with it.
const ICON = 15;

/** `/leagues/<id>/anything` -> `<id>`, so every page in a league lights its row. */
const LEAGUE_ROUTE = /^\/leagues\/([^/]+)/;

type League = { id: string; name: string; color: string | null };

/**
 * One destination. An icon and a name, and every label in the nav is this.
 *
 * `icon` is a node rather than a component type because a league's shield
 * carries a colour that only the caller knows, and threading a colour prop
 * through for the one case that needs it would make every other call site pass
 * an argument about shields.
 */
function Label({
  href,
  icon,
  name,
  active,
}: {
  href: string;
  icon: React.ReactNode;
  name: string;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={`sidenav-item${active ? " is-active" : ""}`}
      aria-current={active ? "page" : undefined}
      // Long league names truncate in the row; the full one is worth keeping
      // somewhere, and a title attribute is where.
      title={name}
    >
      {icon}
      <span>{name}</span>
    </Link>
  );
}

/**
 * A group of labels under a title you can click to collapse.
 *
 * With no `title` it is a bare group: no header, no caret, nothing to collapse.
 * That is the Home/Friends case, and it exists so those two are still labels
 * inside a section rather than a special kind of row floating above the model.
 */
function Section({ title, children }: { title?: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(true);

  if (!title) return <>{children}</>;

  return (
    <>
      <button
        type="button"
        className="sidenav-section"
        // The caret's direction is driven off this in CSS, so the accessible
        // state and the drawn state cannot disagree.
        aria-expanded={open}
        onClick={() => setOpen(o => !o)}
      >
        <span>{title}</span>
        <ChevronDown className="sidenav-caret" size={13} strokeWidth={2} aria-hidden="true" />
      </button>
      {open && children}
    </>
  );
}

export default function SideNav() {
  const pathname = usePathname() ?? "";
  const [leagues, setLeagues] = useState<League[]>([]);
  // Distinguishes "not back yet" from "none". Without it the empty-state line
  // flashes under Leagues on every load for someone who has ten of them.
  const [loaded, setLoaded] = useState(false);

  const routeLeagueId = LEAGUE_ROUTE.exec(pathname)?.[1] ?? "";

  useEffect(() => {
    let live = true;
    api("/memberships").then((ms: any[]) => {
      if (!live) return;
      setLeagues(
        ms.map((m: any) => ({
          id: m.leagueId,
          // The league's own name, not your team's: this row IS the league.
          name: m.league?.name ?? "League",
          // Your helmet colour in that league, which is what makes one shield
          // distinguishable from the next at a glance.
          color: m.helmetColor ?? null,
        })),
      );
    })
      .catch(() => { /* leave the list empty; /home carries the real error UI */ })
      .finally(() => { if (live) setLoaded(true); });
    return () => { live = false; };
    // Re-read when the route changes leagues, so joining or leaving one from
    // /home is reflected without a reload.
  }, [routeLeagueId]);

  const isOn = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  /** The plain icon every non-league label uses. */
  const plain = (Icon: LucideIcon) => <Icon size={ICON} strokeWidth={1.75} />;

  return (
    <nav className="app-sidebar" aria-label="Main">
      {/* The wordmark is the way back to /home, as it has been in every version
          of this chrome. `bare` draws it in currentColor so it takes --text and
          reads as type rather than as a badge with a filled tile. */}
      <Link href="/home" className="sidenav-brand" aria-label="Wagerwolf home">
        <LogoWordmark height={LOCKUP_H} bare />
      </Link>

      {/* Titleless: these two are labels like any other, they simply have no
          heading over them and so nothing to collapse. */}
      <Section>
        <Label href="/home" icon={plain(Home)} name="Home" active={isOn("/home")} />
        <Label href="/friends" icon={plain(Users)} name="Friends" active={isOn("/friends")} />
      </Section>

      <Section title="Leagues">
        {leagues.map((l) => (
          <Label
            key={l.id}
            href={`/leagues/${l.id}`}
            name={l.name}
            active={routeLeagueId === l.id}
            // A SHIELD, OUTLINED IN THE LEAGUE'S COLOUR. `color` is what lucide
            // paints the stroke with; `fill` has to be stated as none because
            // the icon set leaves it at the SVG default of black, which would
            // put a solid black shield inside a coloured outline.
            //
            // Outlined keeps it the same kind of mark as Home's and Friends' —
            // same set, same 1.75px stroke, same weight in the row — with the
            // colour carried by the line rather than by a block of fill.
            //
            // The fallback is the muted grey rather than nothing: a row with no
            // icon sits its name where no other row's name is.
            icon={
              <Shield
                size={ICON}
                strokeWidth={1.75}
                fill="none"
                color={l.color ?? "var(--surface-4)"}
                aria-hidden="true"
              />
            }
          />
        ))}
        {loaded && leagues.length === 0 && (
          <div className="sidenav-note">None yet — join one from Home.</div>
        )}
      </Section>

      {/* The NFL week, grouped by kickoff. Its own component because it fetches
          and polls, and neither belongs in a file about nav structure. */}
      <Section title="Games">
        <SideNavGames />
      </Section>

      {/* A LABEL LIKE ANY OTHER, drawn with .sidenav-item rather than the bar's
          .utility-link. It was plain underlined type, which made the one row
          you always need the only row in the column drawn differently.

          The icon is the app's "this is you" mark — the same one LeagueNav puts
          beside the league name for the per-league profile control. That is a
          deliberate echo, not a coincidence: the two controls are the same idea
          at two scopes, the account that follows you everywhere and the
          identity you carry inside one league.

          No `style` prop: .sidenav-item already sets the size, weight and
          colour every label shares, and passing type here would let this one
          drift from the rest.

          Opens UPWARD — it is the last thing in the column, so a panel hanging
          off the bottom of the trigger would land below the window. */}
      <div className="sidenav-foot">
        <AccountMenu
          placement="up"
          className="sidenav-item"
          icon={<UserIcon size={ICON} />}
        />
      </div>
    </nav>
  );
}
