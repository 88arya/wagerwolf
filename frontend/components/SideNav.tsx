"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRouter } from "next/navigation";
import { Globe, MoreHorizontal, Plus } from "lucide-react";
import type { ComponentType, CSSProperties } from "react";
import { api } from "@/lib/api";
import LeagueActions, { type LeagueAction } from "@/components/LeagueActions";
import AccountMenu from "@/components/AccountMenu";
import LogoWordmark from "@/components/LogoWordmark";
import MenuPanel from "@/components/MenuPanel";
import SupportModal from "@/components/SupportModal";
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

// The circle the help mark should DRAW, and the hover disc behind it.
//
// 27.5 is 22 x 1.25. It is NO LONGER the account circle's 22 — this mark is a
// quarter larger than the one in the head, deliberately, and the two are no
// longer twins in size. Everything else about them still matches.
//
// IT GREW TOWARD THE TOP RIGHT: the bottom-left corner has not moved, and that
// falls out of the layout rather than needing an origin or a transform. The
// button's left edge IS .sidenav-foot's left edge, so extra width can only run
// rightward; the foot sits on the column's floor with its bottom air as
// padding, so extra height can only run upward. Growing this number is
// therefore a scale about the bottom-left corner, and both alignments in
// .sidenav-foot's comment hold unchanged.
const HELP_RING = 27.5;

// What the SVG has to be RENDERED at to draw a HELP_RING circle, which is not
// the same number: the artwork's ring is inset in its own viewBox. It runs
// 2.066..21.934 of 24 units — a 19.868-unit circle in a 24-unit box, 82.8% —
// so rendering at 22 would draw a 18.2px ring, a step smaller than the account
// circle opposite it and visibly loose inside the hover fill.
//
// Written as the arithmetic rather than the answer (~26.58) so it re-derives
// itself if the ring size or the artwork ever changes.
//
// The BUTTON stays HELP_RING, so the column's alignment is untouched and the
// icon simply overhangs its box by ~2.3px a side. Nothing clips it, and the
// drawn ring lands back on the button's own edge to within a rounding error.
const HELP_ICON = (HELP_RING * 24) / 19.868;

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
 * Leaderboard: a podium, drawn here rather than taken from lucide.
 *
 * A FILL icon, like LeagueShield and unlike the two stroke marks above it. The
 * shape is three solid bars — first, second, third — and an outline version
 * would be three hollow rectangles, which at 15px reads as a bar chart rather
 * than a podium. The 24-unit viewBox is the artwork's own; ICON scales it.
 */
function LeaderboardIcon() {
  return (
    <svg
      width={ICON}
      height={ICON}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        fill="currentColor"
        d="M16 11V3H8v6H2v12h20V11zm-6-6h4v14h-4zm-6 6h4v8H4zm16 8h-4v-6h4z"
      />
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

/**
 * The padlock on "Join private league", replacing lucide's `Lock`.
 *
 * A FILLED GLYPH AMONG OUTLINES. Globe and Plus either side of it are lucide's
 * 1.75-stroke line icons; this one is solid, so it carries more weight than its
 * neighbours at the same 14px. That is the tradeoff of the supplied artwork, not
 * an oversight — lucide's Lock is still imported nowhere and one line away if
 * the row should match the other two instead.
 *
 * `strokeWidth` is accepted and ignored. DotsMenu passes it to every icon it
 * renders, and there is no stroke here to apply it to; taking the prop keeps
 * this interchangeable with the lucide icons rather than making the call site
 * special-case it.
 *
 * The upstream artwork opens with <path d="M0 0h1024v1024H0z" fill="none" /> —
 * dropped for the same reason HelpIcon drops its copy: it paints nothing today
 * and becomes a solid square the moment anyone sets `fill` on the <svg> instead
 * of per-path.
 *
 * viewBox is 1024, not lucide's 24. It does not need normalising — width and
 * height are what size an SVG on the page — but it does mean any path edited by
 * hand here is in units 42.7x lucide's.
 */
function LockIcon({ size = 16, style }: { size?: number; strokeWidth?: number; style?: CSSProperties }) {
  return (
    <svg width={size} height={size} viewBox="0 0 1024 1024" aria-hidden="true" style={style}>
      <path
        fill="currentColor"
        d="M832 464h-68V240c0-70.7-57.3-128-128-128H388c-70.7 0-128 57.3-128 128v224h-68c-17.7 0-32 14.3-32 32v384c0 17.7 14.3 32 32 32h640c17.7 0 32-14.3 32-32V496c0-17.7-14.3-32-32-32M332 240c0-30.9 25.1-56 56-56h248c30.9 0 56 25.1 56 56v224H332zm460 600H232V536h560zM484 701v53c0 4.4 3.6 8 8 8h40c4.4 0 8-3.6 8-8v-53a48.01 48.01 0 1 0-56 0"
      />
    </svg>
  );
}

/**
 * How far the sidebar's popups sit from the control that opens them, against
 * MenuPanel's default 6.
 *
 * The panels are tight objects now — rows flush against each other, no vertical
 * padding between the fills — and 6px of air under the trigger read as a bigger
 * separation than anything inside the panel. This went 6 -> 2 -> 0 over three
 * passes, each asked for after seeing the last.
 *
 * 0 IS THE FLOOR, and it is flush rather than overlapping: the panel's top edge
 * meets the trigger's bottom, so its 1px border sits directly against the mark.
 * MenuPanel would accept a negative number and slide the panel up over the
 * trigger, but that puts the panel's border THROUGH the control that opens it
 * and starts covering the thing you just clicked.
 *
 * SIDEBAR ONLY. The bar's and LeagueNav's panels keep the 6, like every other
 * thing scoped away from the sidebar in this file's popups.
 */
const SHELL_MENU_GAP = 0;

/**
 * The stacked sheets on the help menu's "Docs" row.
 *
 * STROKE WIDTH IS DOUBLED, and that is the whole trick. This artwork is drawn
 * on a 48 viewBox where lucide's are on 24, so it renders at half the scale for
 * the same box — a stroke of 1.75 here would come out as 0.875 against the
 * lucide icons in the Leagues menu, visibly thinner. Doubling cancels it exactly: at size 14,
 * 3.5 user units over a 48 viewBox is 3.5 x 14/48 = 1.02 device px, and
 * lucide's 1.75 over 24 is 1.75 x 14/24 = the same 1.02.
 *
 * The multiplier is applied to whatever the caller passes rather than to a
 * hardcoded 3.5, so this tracks DotsMenu's strokeWidth the way a lucide icon
 * would instead of quietly ignoring it.
 *
 * `strokeWidth` therefore matters here and does NOT in the two filled glyphs in
 * this file — LockIcon and MailIcon accept it and ignore it, having no stroke
 * to apply it to. Same prop, opposite reasons; check which kind you have before
 * swapping artwork.
 *
 * The upstream artwork's opening <path d="M0 0h48v48H0z" fill="none" /> is
 * dropped, as in the others.
 */
function DocsIcon({ size = 16, strokeWidth = 1.75, style }: { size?: number; strokeWidth?: number; style?: CSSProperties }) {
  const paths = [
    "M40.358 12.581L26.363 6.04a5.74 5.74 0 0 0-4.857-.001l-13.863 6.47a2.295 2.295 0 0 0-.001 4.159l13.995 6.541a5.74 5.74 0 0 0 4.857.002l13.863-6.471a2.295 2.295 0 0 0 .001-4.159",
    "m13.227 19.278l-5.584 2.606a2.295 2.295 0 0 0-.001 4.16l13.995 6.54a5.74 5.74 0 0 0 4.857.002l13.863-6.47a2.295 2.295 0 0 0 .001-4.159l-5.585-2.61",
    "M13.227 28.654L7.643 31.26a2.295 2.295 0 0 0-.001 4.16l13.995 6.54a5.74 5.74 0 0 0 4.857.001l13.863-6.47a2.295 2.295 0 0 0 .001-4.159l-5.585-2.61",
  ];
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth * 2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={style}
    >
      {paths.map(d => <path key={d} d={d} />)}
    </svg>
  );
}

/**
 * The envelope on the help menu's "Contact us" row, replacing lucide's Mail.
 *
 * A FILLED GLYPH, like LockIcon — `strokeWidth` is accepted and ignored, since
 * DotsMenu passes it to every icon and there is no stroke here to take it. On a
 * filled path the line weight IS the geometry, so it cannot be tuned with a
 * prop; changing it means different artwork. This is the third envelope for
 * that reason.
 *
 * `fillRule="evenodd"` IS LOAD BEARING — do not drop it as boilerplate. The
 * frame is cut out of the outer rectangle by overlapping subpaths rather than
 * drawn as an outline, so under the default `nonzero` rule the whole envelope
 * fills as a solid block. `clipRule` is carried with it because the two are
 * stated together upstream and a future clip-path would need it to agree.
 *
 * viewBox is 24 here — the upstream width/height of 91 is dropped, since `size`
 * is what scales it. The box only has to match its own path data; nothing needs
 * normalising against the 32/48 boxes elsewhere in the file.
 *
 * The upstream artwork's opening <path d="M0 0h24v24H0z" fill="none" /> is
 * dropped, as in the others: it paints nothing and turns into a solid square
 * the moment anyone sets `fill` on the <svg> rather than per-path.
 */
function MailIcon({ size = 16, style }: { size?: number; strokeWidth?: number; style?: CSSProperties }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" style={style}>
      <path
        fill="currentColor"
        fillRule="evenodd"
        clipRule="evenodd"
        d="M4.72 6h14.56L12 12.188zM3 18V7.162l9 7.65l9-7.65V18zM1 4v16h22V4z"
      />
    </svg>
  );
}

/**
 * The gear on the help menu's "Account settings" row, replacing lucide's
 * Settings.
 *
 * A FILLED GLYPH, like MailIcon — `strokeWidth` is accepted and ignored, there
 * being no stroke to take it. Note this drawing only LOOKS like an outline: the
 * ring and its teeth are a filled path following both edges, which is why the
 * weight still cannot be tuned with a prop. It replaced a solid gear that read
 * much heavier at the same size.
 *
 * WITH THIS, THE HELP MENU IS ALL HAND-DRAWN. Settings was the last lucide icon
 * in it. The three-dot trigger and the Leagues menu still use lucide
 * (MoreHorizontal, Globe, Plus), so the import is not going away.
 *
 * ONE PATH, unlike the solid gear before it, which needed a second for the hub.
 * Here the hub is a subpath of the same path and the fill rule cuts it out.
 *
 * THE VIEWBOX IS CROPPED TO 1 1 14 14, not the artwork's own 0 0 16 16, and
 * that is an optical-size correction rather than a mistake.
 *
 * Every icon in this menu is handed the same 14px box by DotsMenu, so what
 * decides apparent size is how much of its OWN viewBox each drawing fills — and
 * these came from four different sets. Measured: this gear spans 11.46 x 11.74
 * of its 16 box (72%), where the envelope spans 92% of its 24. Same 14px box,
 * and the gear rendered 10.0px wide against the envelope's 12.8. It read as the
 * small one because it is drawn with nearly four times the margin.
 *
 * Cropping 1 unit off each side scales the glyph to 11.5 x 11.7px, which is
 * also where lucide's own icons land (their glyphs run about 20 of 24 units, so
 * 11.7px at this size) — so this sits correctly beside Globe and Plus in the
 * Leagues menu too.
 *
 * IT STAYS CENTRED because the crop is symmetric AND the glyph is: its bounds
 * are 2.27..13.73, centred on 8.0, and 1..15 is centred on 8.0. Re-cropping
 * different artwork means re-measuring, not reusing these numbers.
 *
 * The upstream artwork's opening <path d="M0 0h16v16H0z" fill="none" /> is
 * dropped, as in the others, and its width/height of 91 with it — `size` is
 * what scales this.
 */
function SettingsIcon({ size = 16, style }: { size?: number; strokeWidth?: number; style?: CSSProperties }) {
  return (
    <svg width={size} height={size} viewBox="1 1 14 14" aria-hidden="true" style={style}>
      <path fill="currentColor" d="M8 6a2 2 0 1 0 0 4a2 2 0 0 0 0-4M7 8a1 1 0 1 1 2 0a1 1 0 0 1-2 0m3.618-3.602a.71.71 0 0 1-.824-.567l-.26-1.416a.35.35 0 0 0-.275-.282a6.1 6.1 0 0 0-2.519 0a.35.35 0 0 0-.275.282l-.259 1.416a.71.71 0 0 1-.936.538l-1.359-.484a.36.36 0 0 0-.382.095a6 6 0 0 0-1.262 2.173a.35.35 0 0 0 .108.378l1.102.931q.045.037.081.081a.704.704 0 0 1-.081.995l-1.102.931a.35.35 0 0 0-.108.378A6 6 0 0 0 3.53 12.02a.36.36 0 0 0 .382.095l1.36-.484a.708.708 0 0 1 .936.538l.258 1.416c.026.14.135.252.275.281a6.1 6.1 0 0 0 2.52 0a.35.35 0 0 0 .274-.281l.26-1.416a.71.71 0 0 1 .936-.538l1.359.484c.135.048.286.01.382-.095a6 6 0 0 0 1.262-2.173a.35.35 0 0 0-.108-.378l-1.102-.931a.703.703 0 0 1 0-1.076l1.102-.931a.35.35 0 0 0 .108-.378A6 6 0 0 0 12.47 3.98a.36.36 0 0 0-.382-.095l-1.36.484a1 1 0 0 1-.111.03m-6.62.58l.937.333a1.71 1.71 0 0 0 2.255-1.3l.177-.97a5 5 0 0 1 1.265 0l.178.97a1.708 1.708 0 0 0 2.255 1.3L12 4.977q.384.503.63 1.084l-.754.637a1.704 1.704 0 0 0 0 2.604l.755.637a5 5 0 0 1-.63 1.084l-.937-.334a1.71 1.71 0 0 0-2.255 1.3l-.178.97a5 5 0 0 1-1.265 0l-.177-.97a1.708 1.708 0 0 0-2.255-1.3L4 11.023a5 5 0 0 1-.63-1.084l.754-.638a1.704 1.704 0 0 0 0-2.603l-.755-.637q.248-.581.63-1.084" />
    </svg>
  );
}

/** The three ways into a league, and the only thing "More" opens. */
const MORE_ACTIONS: Array<{ action: LeagueAction; name: string; icon: MenuIcon }> = [
  { action: "public",  name: "Join public league",  icon: Globe },
  { action: "private", name: "Join private league", icon: LockIcon },
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
/**
 * What a menu row will accept as its icon. Written as the SHAPE DotsMenu calls
 * rather than as `LucideIcon`, so a hand-drawn glyph like LockIcon is a peer of
 * the imported ones instead of something the call site has to special-case.
 * Every lucide icon satisfies it.
 */
type MenuIcon = ComponentType<{ size?: number; strokeWidth?: number; style?: CSSProperties }>;

type MenuItem = {
  key: string;
  name: string;
  icon?: MenuIcon;
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
function DotsMenu({
  label,
  items,
  trigger = <MoreHorizontal size={15} strokeWidth={1.75} />,
  triggerClass = "sidenav-more",
  placement = "down",
}: {
  label: string;
  items: MenuItem[];
  trigger?: React.ReactNode;
  triggerClass?: string;
  placement?: "up" | "down";
}) {
  const [open, setOpen] = useState(false);
  // The panel is portaled out of this wrapper now, so it anchors off the BUTTON
  // rather than the wrapper, and the outside-click check has to know about two
  // separate boxes. Both of those live in MenuPanel.
  const btnRef = useRef<HTMLButtonElement>(null);

  return (
    <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
      <button
        ref={btnRef}
        type="button"
        className={triggerClass}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        onClick={() => setOpen(o => !o)}
      >
        {trigger}
      </button>

      {open && (
        <MenuPanel
          anchorRef={btnRef}
          placement={placement}
          onClose={() => setOpen(false)}
          className={`utility-menu is-shell is-${placement}`}
          gap={SHELL_MENU_GAP}
          role="menu"
          style={{
            // NO `background` HERE. It is .utility-menu.is-shell's, in
            // globals.css — var(--shell-menu-bg), #FAFCFF. It moved out of this
            // object because an inline style out-specifies every rule, so the
            // fill could not be scoped to the sidebar while both call sites set
            // it here.
            // THE CARD'S OUTLINE. .app-card is 1px solid var(--border) with
            // var(--radius-card); this panel now carries both, so the two
            // floating surfaces on a signed-in screen are cut and edged the
            // same way.
            //
            // It is also what replaces the shadow removed below — the house
            // rule is a 1px border INSTEAD OF an elevation, not as well as one,
            // and it is what keeps the panel legible on the marketing routes
            // where TopBar opens this same component onto --bg and tone alone
            // was nearly white-on-white.
            border: "1px solid var(--border)",
            // NO `borderRadius` HERE — it is .utility-menu's, in globals.css.
            // It moved out of this object alongside the fill above, when the
            // sidebar's panels were briefly squared; that was reverted and the
            // corner is var(--radius-card) again for every panel, but the
            // declaration stays in CSS beside the fill it belongs with.
            // NO SHADOW. --shadow-md was reserved for exactly this — CLAUDE.md
            // calls dropdowns and drawers the one sanctioned use, since they
            // genuinely float — but the panel is dropped here in favour of the
            // rest of the system's rule: structure is a hairline or a gap,
            // never a shadow.
            //
            // What separates it is the border above, and tone only barely:
            // --shell-menu-bg (#FAFCFF) on the sidebar's --shell-bg (#F5F8FF)
            // is three points of blue apart. That is a deliberate choice and it
            // makes the hairline load bearing rather than decorative — this
            // panel would read as a floating rectangle-shaped nothing without
            // it. The earlier note here claimed tone alone was "enough in the
            // shell"; that was written when the fill was white.
            boxShadow: "none",
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
        </MenuPanel>
      )}
    </div>
  );
}

/**
 * The Leagues header's menu: the three ways into a league.
 *
 * IT CARRIES THE FORMS NOW. Each row used to record an intent in
 * lib/leagueActions and push you to /home, where LeaguesRail was expected to
 * pick it up and open the real surface. That file is deleted and so is the
 * round trip: the menu mounts components/LeagueActions directly, so the
 * control and the thing it controls are one component — the same correction
 * LeagueNav already applies to LeagueProfileModal.
 *
 * The old arrangement was load-bearing only while the rail owned these forms.
 * It also silently did nothing once the rail came off /home, which is how
 * joining a league stopped being possible anywhere in the app.
 *
 * LeagueActions returns null until `action` is non-null, so mounting it in the
 * permanent sidebar costs a closed component and nothing else.
 */
function LeaguesMenu() {
  const [action, setAction] = useState<LeagueAction | null>(null);

  return (
    <>
      <DotsMenu
        label="Add a league"
        items={MORE_ACTIONS.map(a => ({
          key: a.action,
          name: a.name,
          icon: a.icon,
          onSelect: () => setAction(a.action),
        }))}
      />
      <LeagueActions action={action} onClose={() => setAction(null)} />
    </>
  );
}

/**
 * The question mark in a ring.
 *
 * IT DRAWS ITS OWN BORDER, which is the thing to know before styling it: the
 * last path is the ring, and the first plus the <circle> are the glyph and its
 * dot. .sidenav-help therefore sets `border: none` — a CSS border here would be
 * a second circle just outside this one.
 *
 * A LIGHT RING BY DESIGN. The outline is 1 unit of 24, so ~1.1px once rendered
 * at HELP_ICON — thinner than the 1.5px CSS border it grew out of, and thinner
 * again than the previous artwork's ~1.6px. That is the point of this icon
 * rather than a fault in it: if it ever reads too faint, the fix is a heavier
 * icon, NOT a CSS border added back alongside this ring.
 *
 * The upstream artwork opens with <path d="M0 0h24v24H0z" fill="none" />, a
 * full-box path that paints nothing. It is dropped rather than copied: it does
 * nothing today, and it is a trap the moment anyone sets `fill` on the <svg>
 * instead of per-path, at which point it becomes a solid square.
 *
 * TWO COLOURS, ONE DEFAULT. The ring reads --help-ring and the glyph and its
 * dot read --help-mark, each falling back to currentColor — so with neither
 * variable set the whole icon takes the button's own `color` exactly as it did
 * when all three fills were currentColor, in every state, and nothing about the
 * current appearance depends on the split.
 *
 * To drive them apart, set either variable on .sidenav-help (and again under
 * its :hover/:active/[aria-expanded] rule if the state should differ). Keep
 * them to the palette's tokens — --text, --text-2, --text-3, --accent — rather
 * than literals; see the design-system note in CLAUDE.md.
 *
 * THE DOT GOES WITH THE GLYPH, not the ring. It is the question mark's point,
 * so recolouring the mark and leaving the dot behind would read as a bug.
 */
function HelpIcon() {
  return (
    <svg
      width={HELP_ICON}
      height={HELP_ICON}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      style={{ flexShrink: 0 }}
    >
      <path
        fill="var(--help-mark, currentColor)"
        d="M11.411 12.459a1.55 1.55 0 0 1 .341-.6a2.6 2.6 0 0 1 .535-.417a2.2 2.2 0 0 0 .363-.286a1.2 1.2 0 0 0 .256-.363a1.1 1.1 0 0 0 .094-.452a.9.9 0 0 0-.142-.517a.94.94 0 0 0-.374-.338a1.1 1.1 0 0 0-.519-.119a1.2 1.2 0 0 0-.495.107a.93.93 0 0 0-.389.335a1 1 0 0 0-.111.224a.52.52 0 0 1-.483.359a.506.506 0 0 1-.479-.675a1.7 1.7 0 0 1 .178-.349a1.8 1.8 0 0 1 .748-.634a2.4 2.4 0 0 1 1.031-.215a2.4 2.4 0 0 1 1.082.231a1.74 1.74 0 0 1 .721.641a1.77 1.77 0 0 1 .257.96a1.8 1.8 0 0 1-.118.678a1.7 1.7 0 0 1-.334.536a2.3 2.3 0 0 1-.52.417a2.3 2.3 0 0 0-.462.369a1.1 1.1 0 0 0-.256.455a2 2 0 0 0-.045.283a.49.49 0 0 1-.483.429a.484.484 0 0 1-.483-.531a3 3 0 0 1 .087-.528"
      />
      <circle cx="11.793" cy="14.891" r=".587" fill="var(--help-mark, currentColor)" />
      <path
        fill="var(--help-ring, currentColor)"
        d="M12 21.931A9.934 9.934 0 1 1 21.934 12A9.945 9.945 0 0 1 12 21.931m0-18.867A8.934 8.934 0 1 0 20.934 12A8.943 8.943 0 0 0 12 3.064"
      />
    </svg>
  );
}

/**
 * THE HELP CONTROL AT THE FOOT, and the four documents behind it.
 *
 * WHY IT EXISTS AT ALL. AppFrame's signed-in shell renders no footer — the
 * brief was the nav and the card and nothing else — so /terms, /privacy and
 * /how-to-play had no way in from any signed-in page. They were reachable only
 * from the marketing routes, which is to say only by signing out or typing the
 * URL. This is the queued "put them somewhere reachable" item in CLAUDE.md.
 *
 * A MARK RATHER THAN ROWS. These are documents, not destinations in the app the
 * way Home and Leagues are, and four labelled rows would have put four of them
 * in a column that already lists six leagues and sixteen games. One circle on
 * the floor of the column, opening upward, out of the way until it is wanted.
 *
 * All four leave the shell: they are bare routes carrying their own headers.
 * That is what those routes already are, not something this menu decides.
 *
 * ACCOUNT SETTINGS IS DELIBERATELY IN TWO PLACES — here, and in the account
 * panel in the head. The duplication is the point: this is where someone looks
 * when they want "the settings and the small print", and sending them to the
 * opposite corner of the column for one of the two would be the worse answer.
 */
function HelpMenu() {
  const router = useRouter();
  // Mounted here rather than inside the menu: DotsMenu closes on select, so a
  // modal owned by the panel would unmount in the same tick it was opened.
  const [support, setSupport] = useState(false);
  return (
    <>
    <DotsMenu
      label="Help and documents"
      // UP, because it sits on the floor of the column. .utility-menu.is-up
      // pins the panel's foot to the trigger's head, so the panel's own height
      // never enters into whether it fits.
      placement="up"
      triggerClass="sidenav-help"
      // The ring comes with the glyph — see HelpIcon, and .sidenav-help's
      // `border: none`.
      trigger={<HelpIcon />}
      items={[
        { key: "settings", name: "Account settings", icon: SettingsIcon, onSelect: () => router.push("/settings") },
        // ONE ROW FOR ALL FOUR DOCUMENTS, and it lands on the index rather
        // than on any one of them.
        //
        // This was three rows, then two, and is now one. It pointed at /terms
        // for a while, which left /privacy and /responsible-gaming reachable
        // only by going out through the support page — the legal documents do
        // not cross-link, so /terms was a dead end for the other two. Splitting
        // it into Legal + How to play replaced that with a different oddity:
        // two rows, one destination, because both are the same section now.
        //
        // /docs' own rail is the place to choose between them, and it lists
        // exactly the two things those rows named. A menu that offers a choice
        // the page it opens immediately offers again is one step too many.
        //
        // DocsIcon, stacked sheets — a section of documents rather than one
        // page. It replaced FileText, which the legal row used to carry and
        // which the /docs index still puts on its Terms of Service card; the
        // row and that card no longer share a mark, which is right now that the
        // row stands for four documents rather than three.
                //
        // A NEW TAB, not a push. The docs section is a place you consult while
        // doing something else, and navigating to it in the app's own tab meant
        // finding your way back afterwards — which the shell's Done button did
        // by `router.back()`, one press per page you had looked at. Clicking
        // three documents needed three Dones. A separate tab removes the return
        // journey rather than shortening it: the app tab never moved.
        //
        // `noopener` because the opened page gets a `window.opener` handle
        // without it. Same origin here, so this is hygiene rather than a live
        // hole, but it is the kind of default worth not having to think about.
        { key: "docs", name: "Docs", icon: DocsIcon, onSelect: () => window.open("/docs", "_blank", "noopener,noreferrer") },
        // LAST, under Docs. It was second, and the two swapped on 30 Aug 2026:
        // the documents answer the question first, and writing to a person is
        // what you do when they did not. Ordering the menu that way puts the
        // cheaper answer in front of the expensive one.
        //
        // It opens the support modal rather than navigating: /contact is
        // deleted, and the
        // whole point of the modal is that asking for help does not take you
        // off the page you were on. SUPPORT_EMAIL behind it is still a
        // placeholder that does not resolve — see lib/support.
        { key: "contact", name: "Contact us", icon: MailIcon, onSelect: () => setSupport(true) },
      ]}
    />
    {support && <SupportModal onClose={() => setSupport(false)} />}
    </>
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
          panelClassName="is-shell"
          panelGap={SHELL_MENU_GAP}
          icon={<UserIcon size={AVATAR_ICON} />}
        />
      </div>

      {/* Titleless: these two are labels like any other, they simply have no
          heading over them and so nothing to collapse. */}
      <Section>
        <Label href="/home" icon={<HomeIcon />} name="Home" active={isOn("/home")} />
        <Label href="/friends" icon={<FriendsIcon />} name="Friends" active={isOn("/friends")} />
        {/* SINGULAR /leaderboard, which is the route that exists. Adding this
            row is also what un-orphans it: the page has been reachable only by
            typing the URL since the utility bar left the shell, and its own
            comment still claims the bar links here. */}
        <Label href="/leaderboard" icon={<LeaderboardIcon />} name="Leaderboard" active={isOn("/leaderboard")} />
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

      {/* THE FOOT. Sticky rather than simply last: the Games section makes this
          column overflow, and a control that scrolls away with the list is not
          in the bottom-left corner, it is at the end of a list. See
          .sidenav-foot in globals.css. */}
      <div className="sidenav-foot">
        <HelpMenu />
      </div>
    </nav>
  );
}
