"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRouter } from "next/navigation";
import { Globe, Lock, MoreHorizontal, Plus } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { api } from "@/lib/api";
import { requestLeagueAction, type LeagueAction } from "@/lib/leagueActions";
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
 * see components/SideNavGames. It is a list of fixtures carrying each side's
 * moneyline, not the games strip brought back: no cards, no motion, and no
 * market but that one.
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

// The account mark in the head, which is deliberately NOT ICON. ICON is the
// label rows' icon column and is load bearing — 11px padding + ICON + the 6px
// gap is the 32px a label's text starts on, and the fixture grid squares to it —
// so the head cannot borrow it just because both happen to be icons.
//
// It sits in a circle sized to LOCKUP_H, so that the hover fill's top and bottom
// land on the wordmark's — see .sidenav-avatar in globals.css, which hardcodes
// that 22 and has to be changed alongside LOCKUP_H above.
const AVATAR_ICON = 16;

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
 * Home, drawn here rather than taken from lucide.
 *
 * A STROKE icon, unlike LeagueShield below it — `fill="none"` with the outline
 * in `stroke="currentColor"`, which is how the lucide marks beside it work, so
 * it takes the row's colour the same way they do and needs no special casing
 * anywhere.
 *
 * `strokeWidth={2}` is the artwork's own, against the 1.75 the lucide icons in
 * this nav are drawn at. Both are on a 24-unit viewBox scaled to ICON, so this
 * one lands very slightly heavier — about 1.25 device pixels against 1.09.
 * Kept as supplied rather than normalised: it is a hair, and the shape was
 * designed at this weight.
 *
 * Two paths: the roof-and-walls, and the door standing on the baseline. The
 * source wraps them in a `<g>` carrying the stroke attributes; they sit on the
 * `<svg>` here instead, since SVG presentation attributes inherit and the group
 * was doing nothing else.
 */
function HomeIcon() {
  return (
    <svg
      width={ICON}
      height={ICON}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M21 19v-6.733a4 4 0 0 0-1.245-2.9L13.378 3.31a2 2 0 0 0-2.755 0L4.245 9.367A4 4 0 0 0 3 12.267V19a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2" />
      <path d="M9 15a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v6H9z" />
    </svg>
  );
}

/**
 * Friends, drawn here rather than taken from lucide.
 *
 * A stroke icon like HomeIcon above it — same 24-unit viewBox, same
 * `strokeWidth={2}`, same `currentColor` — so the two sit at the same weight
 * beside each other and both take the row's colour with no special casing.
 *
 * One path, four subpaths: three small circles at the points of a triangle, a
 * larger one in the middle, and the strokes joining them. Not separable into
 * "people" — it is a network mark rather than a group of figures, which is why
 * it reads at 15px where a crowd of heads would not.
 */
function FriendsIcon() {
  return (
    <svg
      width={ICON}
      height={ICON}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M10 5a2 2 0 1 0 4 0a2 2 0 1 0-4 0M3 19a2 2 0 1 0 4 0a2 2 0 1 0-4 0m14 0a2 2 0 1 0 4 0a2 2 0 1 0-4 0m-8-5a3 3 0 1 0 6 0a3 3 0 1 0-6 0m3-7v4m-5.3 6.8l2.8-2m7.8 2l-2.8-2" />
    </svg>
  );
}

/**
 * A league's shield, drawn here rather than taken from lucide.
 *
 * AN OUTLINE MADE OF FILL, which is the thing to know before editing it. The
 * single path traces the crest's outer edge and then its inner edge, so the
 * even-odd winding leaves the middle open — it reads as a stroked shield but
 * responds to `fill`, not `stroke`. Setting `strokeWidth` on it does nothing,
 * and setting `fill="none"` makes it vanish rather than hollowing it out.
 *
 * Why the colour still lands: `fill="currentColor"` with the league's helmet
 * colour set as `color` on the element. Driving it off currentColor rather than
 * a literal `fill` prop means a future hover or active state can recolour the
 * mark by setting `color`, the way it would for text.
 *
 * It is back to reading as an outline after a spell as a solid two-tone crest.
 * The solid version was chosen because a 1.75px lucide hairline is barely a
 * colour at 15px, and the helmet colour is the only thing telling one league row
 * from another — but this path's rim is far heavier than that hairline was, so
 * it carries the colour perfectly well while sitting closer in weight to the
 * outlined Home and Friends icons above it.
 *
 * The 24-unit viewBox is the artwork's own; ICON scales it to the label grid.
 */
function LeagueShield({ color }: { color: string }) {
  return (
    <svg
      width={ICON}
      height={ICON}
      viewBox="0 0 24 24"
      fill="none"
      style={{ color }}
      aria-hidden="true"
    >
      <path
        fill="currentColor"
        d="M20.995 6.903a1 1 0 0 0-.547-.797l-7.973-4a1 1 0 0 0-.895-.002l-8.027 4c-.297.15-.502.437-.544.767c-.013.097-1.145 9.741 8.541 15.008a1 1 0 0 0 .969-.009c9.307-5.259 8.514-14.573 8.476-14.967m-8.977 12.944c-6.86-4.01-7.14-10.352-7.063-12.205l7.071-3.523l6.998 3.511c.005 1.87-.481 8.243-7.006 12.217"
      />
    </svg>
  );
}

/**
 * The section caret: a solid triangle, drawn here rather than taken from lucide.
 *
 * Every other icon in this nav is a lucide outline at `strokeWidth={1.75}`, and
 * this one is deliberately not. The caret is not a destination's mark — it is a
 * state, saying whether the group under it is open — so it reads better as a
 * filled shape than as one more 1.75px line in a column already full of them.
 *
 * lucide's own `Triangle` is an outline with rounded joins that stays visibly
 * rounded when filled, and it points up; nine pixels of `path` is smaller than
 * the overrides needed to make it behave.
 *
 * Drawn pointing DOWN, which is the open state.
 * `.sidenav-section[aria-expanded="false"]` turns it a quarter to the right in
 * CSS, so the collapsed arrow is this same shape rotated and cannot drift from
 * it. Right when shut, down when open — the disclosure convention.
 */
function Caret() {
  return (
    <svg
      className="sidenav-caret"
      width={9}
      height={9}
      viewBox="0 0 10 10"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M1 3.5h8L5 8.5z" />
    </svg>
  );
}

/**
 * A group of labels under a title you can click to collapse.
 *
 * With no `title` it is a bare group: no header, no caret, nothing to collapse.
 * That is the Home/Friends case, and it exists so those two are still labels
 * inside a section rather than a special kind of row floating above the model.
 *
 * `action` is a control on the right of the title's own line — Leagues puts the
 * "More" menu there. It is a SIBLING of the toggle rather than a child, and has
 * to be: the title is a `<button>`, and a button inside a button is invalid and
 * would make the inner one unclickable. So the header is a flex row holding two
 * independent controls, which is also what lets the title stretch and the action
 * sit hard against the right edge.
 */
function Section({
  title,
  action,
  children,
}: {
  title?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(true);

  if (!title) return <>{children}</>;

  return (
    <>
      <div className="sidenav-section-row">
        <button
          type="button"
          className="sidenav-section"
          // The caret's direction is driven off this in CSS, so the accessible
          // state and the drawn state cannot disagree.
          aria-expanded={open}
          onClick={() => setOpen(o => !o)}
        >
          <span>{title}</span>
          <Caret />
        </button>
        {action}
      </div>
      {open && children}
    </>
  );
}

/** The three ways into a league, and the only thing "More" opens. */
const MORE_ACTIONS: Array<{ action: LeagueAction; name: string; icon: LucideIcon }> = [
  { action: "public",  name: "Join public league",  icon: Globe },
  { action: "private", name: "Join private league", icon: Lock },
  { action: "create",  name: "Create a league",     icon: Plus },
];

/**
 * One row of a dots menu: a command. It acts and the menu closes.
 *
 * There was a `checked` variant for a while — a row that drew a tick and left
 * the panel open — carrying the Games header's "Hide odds" switch. That switch
 * is gone and so is the machinery; if a setting ever lands in one of these
 * menus again, it needs the tick, the `menuitemcheckbox` role and the
 * stay-open behaviour back, not just a boolean.
 */
type MenuItem = {
  key: string;
  name: string;
  icon?: LucideIcon;
  onSelect: () => void;
};

/**
 * A three-dot control on a section header, and the popup it opens.
 *
 * ONE COMPONENT FOR BOTH HEADERS. Leagues opens three ways into a league;
 * Games opens one switch. They are the same control with different rows, and
 * the trigger, the placement, the outside-click and the panel treatment are the
 * part worth having once.
 *
 * It reuses `.utility-menu` and `.navmenu-profile` — the panel AccountMenu drops
 * at the foot of this same column — rather than a second panel vocabulary.
 *
 * CLICK ONLY. Hover-to-open on a 22px target is a menu that opens when you were
 * reaching for the collapse caret beside it. The outside-`mousedown` listener is
 * what closes it, and covers touch, where there is no pointer to leave.
 *
 * `is-down` anchors the panel's right edge to the trigger's, so it opens back
 * across the sidebar rather than out over the card. It is clipped by
 * .app-sidebar's `overflow-y: auto` like anything else in the scroller, which is
 * why both call sites sit on a header near the top of the column.
 */
function DotsMenu({ label, items }: { label: string; items: MenuItem[] }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDocDown(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocDown);
    return () => document.removeEventListener("mousedown", onDocDown);
  }, []);

  return (
    <div ref={wrapRef} style={{ position: "relative", display: "flex", alignItems: "center" }}>
      <button
        type="button"
        className="sidenav-more"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        onClick={() => setOpen(o => !o)}
      >
        <MoreHorizontal size={15} strokeWidth={1.75} />
      </button>

      {open && (
        <div
          className="utility-menu is-down"
          role="menu"
          style={{
            background: "var(--surface)",
            border: "none",
            borderRadius: 0,
            boxShadow: "var(--shadow-md)",
            zIndex: 500,
            padding: "6px 0",
          }}
        >
          {items.map(({ key, name, icon: Icon, onSelect }) => (
            <button
              key={key}
              type="button"
              role="menuitem"
              className="navmenu-profile"
              onClick={() => { onSelect(); setOpen(false); }}
            >
              {/* gap inline, as AccountMenu's rows do it: .navmenu-profile > span
                  is a flex row sized for text alone, and an icon needs air after
                  it that the shared rule does not provide. */}
              <span style={{ gap: 8 }}>
                {Icon && <Icon size={14} strokeWidth={1.75} style={{ flexShrink: 0 }} />}
                {name}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * The Leagues header's menu: the three ways into a league.
 *
 * It does not carry the forms. Each row records the intent and sends you to
 * /home, where components/LeaguesRail opens the real surface — see
 * lib/leagueActions for why the forms cannot live in the sidebar.
 */
function LeaguesMenu() {
  const router = useRouter();

  function pick(action: LeagueAction) {
    requestLeagueAction(action);
    // Always pushed, even from /home. The router no-ops when the path already
    // matches, and the event fired above is what reaches an already-mounted
    // rail — so this is safe in both directions.
    router.push("/home");
  }

  return (
    <DotsMenu
      label="Add a league"
      items={MORE_ACTIONS.map(a => ({
        key: a.action,
        name: a.name,
        icon: a.icon,
        onSelect: () => pick(a.action),
      }))}
    />
  );
}

export default function SideNav() {
  const pathname = usePathname() ?? "";
  // No loading flag beside it: the only thing that ever needed one was the
  // "None yet" sentence, which had to wait for the fetch so it did not flash
  // under Leagues for someone who has ten of them. The "More" row replaced it
  // and is true before the fetch as much as after, so an empty list is now just
  // a section with one row in it.
  const [leagues, setLeagues] = useState<League[]>([]);

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
      .catch(() => { /* leave the list empty; /home carries the real error UI */ });
    return () => { live = false; };
    // Re-read when the route changes leagues, so joining or leaving one from
    // /home is reflected without a reload.
  }, [routeLeagueId]);

  const isOn = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  return (
    <nav className="app-sidebar" aria-label="Main">
      {/* THE HEAD: the lockup, and the account control opposite it.

          The wordmark is the way back to /home, as it has been in every version
          of this chrome. `bare` draws it in currentColor so it takes --text and
          reads as type rather than as a badge with a filled tile.

          The account control is HERE AND NOWHERE ELSE now. It used to be a
          full-width labelled row at the foot of the column — `.sidenav-foot`,
          `placement="up"` — and for a while both existed; that copy is gone,
          along with the second /users/me fetch it cost.

          `placement="down"` because it is at the top: the panel hangs below.
          The panel is where the name is shown, since the trigger is an icon. */}
      <div className="sidenav-head">
        <Link href="/home" className="sidenav-brand" aria-label="Wagerwolf home">
          <LogoWordmark height={LOCKUP_H} bare />
        </Link>
        <AccountMenu
          placement="down"
          className="sidenav-avatar"
          icon={<UserIcon size={AVATAR_ICON} />}
        />
      </div>

      {/* Titleless: these two are labels like any other, they simply have no
          heading over them and so nothing to collapse. */}
      <Section>
        <Label href="/home" icon={<HomeIcon />} name="Home" active={isOn("/home")} />
        <Label href="/friends" icon={<FriendsIcon />} name="Friends" active={isOn("/friends")} />
      </Section>

      <Section title="Leagues" action={<LeaguesMenu />}>
        {leagues.map((l) => (
          <Label
            key={l.id}
            href={`/leagues/${l.id}`}
            name={l.name}
            active={routeLeagueId === l.id}
            // A SHIELD, FILLED IN THE LEAGUE'S COLOUR — see LeagueShield for why
            // it is a block rather than an outline.
            //
            // The fallback is the muted grey rather than nothing: a row with no
            // icon sits its name where no other row's name is.
            icon={<LeagueShield color={l.color ?? "var(--surface-4)"} />}
          />
        ))}
      </Section>

      {/* The NFL week, grouped by kickoff. Its own component because it fetches
          and polls, and neither belongs in a file about nav structure. */}
      <Section title="Games">
        <SideNavGames />
      </Section>

    </nav>
  );
}
