"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { api } from "@/lib/api";
import HelmetAvatar from "@/components/HelmetAvatar";
import LeagueProfileModal from "@/components/LeagueProfileModal";
import { ACCENT } from "@/lib/constants";
import { useDevicePixelRatio, snapToDevicePx } from "@/lib/hairline";

// Fixed column width for the LEAGUE / BET dropdown items, so the hover
// highlight is the same rectangle for every entry regardless of label length.
// Must stay in sync with `.navmenu-item` in globals.css: 124px highlight
// + 8px padding either side.
const MENU_ITEM_W = 140;

function ChevronDown() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

// Solid person-in-circle. Filled rather than stroked, so it takes `fill` from
// currentColor and ignores strokeWidth.
function UserIcon() {
  return (
    <svg width="26" height="26" viewBox="0 0 512 512" fill="currentColor" aria-hidden="true">
      <path fillRule="evenodd" d="M256 42.667A213.333 213.333 0 0 1 469.334 256c0 117.821-95.513 213.334-213.334 213.334c-117.82 0-213.333-95.513-213.333-213.334C42.667 138.18 138.18 42.667 256 42.667m21.334 234.667h-42.667c-52.815 0-98.158 31.987-117.715 77.648c30.944 43.391 81.692 71.685 139.048 71.685s108.104-28.294 139.049-71.688c-19.557-45.658-64.9-77.645-117.715-77.645M256 106.667c-35.346 0-64 28.654-64 64s28.654 64 64 64s64-28.654 64-64s-28.653-64-64-64" />
    </svg>
  );
}

export default function LeagueNav({ leagueId }: { leagueId: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const [leagues, setLeagues] = useState<any[]>([]);
  const [currentLeague, setCurrentLeague] = useState<any>(null);
  const [myDisplayName, setMyDisplayName] = useState("");
  const [open, setOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  // The identity editor is mounted here rather than reached by routing —
  // see the header comment in LeagueProfileModal for why the old
  // ?edit=profile round trip could not work from the league home page.
  const [editorOpen, setEditorOpen] = useState(false);
  const [hoveredGroup, setHoveredGroup] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  // The group menus (LEAGUE / BET / ...) were hover-only, so on a touch device
  // they could be opened by tap (see onPointerDown below) but never dismissed —
  // there is no pointerleave to close them. This is what the outside-tap
  // handler measures against.
  const groupsRef = useRef<HTMLDivElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);
  const navStartedRef = useRef(false);

  // Every underline in this nav is a filled element snapped to whole device
  // pixels — see lib/hairline for why neither the snapping nor the switch away
  // from inset box-shadows is optional.
  const dpr = useDevicePixelRatio();

  useEffect(() => {
    // Only the display name is needed here: this nav is entirely league-scoped
    // now, and the real name/email belong to My Account in the utility bar.
    api("/users/me").then((u: any) => {
      setMyDisplayName(u.displayName || u.name || "");
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (navStartedRef.current) return;
    api("/memberships").then((ms: any[]) => {
      setLeagues(ms);
      const match = ms.find((m: any) => m.leagueId === leagueId) ?? null;
      setCurrentLeague(match);
      if (match?.league?.seasonStarted) navStartedRef.current = true;
    }).catch(() => {});
  }, [leagueId, pathname]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) setOpen(false);
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) setProfileOpen(false);
      if (groupsRef.current && !groupsRef.current.contains(e.target as Node)) setHoveredGroup(null);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  useEffect(() => {
    function refetch() {
      api("/memberships").then((ms: any[]) => {
        setLeagues(ms);
        const match = ms.find((m: any) => m.leagueId === leagueId) ?? null;
        setCurrentLeague(match);
      }).catch(() => {});
    }
    window.addEventListener("league-profile-updated", refetch);
    window.addEventListener("bet-placed", refetch);
    return () => {
      window.removeEventListener("league-profile-updated", refetch);
      window.removeEventListener("bet-placed", refetch);
    };
  }, [leagueId]);

  // The user's team within *this* league. Falls back to the account display
  // name for members who have not renamed their team yet — the same fallback
  // every leaderboard/feed/chat endpoint applies.
  const teamName = currentLeague?.displayName || myDisplayName;

  const base = `/leagues/${leagueId}`;

  const seasonStarted = currentLeague?.league?.seasonStarted ?? false;

  const lobbyLinks = [
    { label: "Members", href: `${base}/members` },
    { label: "Settings", href: `${base}/settings` },
  ];

  const groups = [
    {
      label: "LEAGUE",
      links: [
        { label: "Home",            href: base },
        { label: "Matchup",         href: `${base}/matchup` },
        { label: "Scoreboard",      href: `${base}/scoreboard` },
        { label: "Standings",       href: `${base}/standings` },
        { label: "Members",         href: `${base}/members` },
        { label: "Bracket",         href: `${base}/bracket` },
        { label: "Schedule",        href: `${base}/schedule` },
        { label: "Settings",        href: `${base}/settings` },
      ],
    },
    {
      label: "BET",
      links: [
        { label: "Sportsbook", href: `${base}/bet` },
        { label: "Specials",   href: `${base}/specials` },
        { label: "My Bets",    href: `${base}/mybets` },
        { label: "History",    href: `${base}/history` },
      ],
    },
  ];

  function isActive(href: string) {
    if (href === base) return pathname === base;
    return pathname.startsWith(href);
  }

  const activeGroup = seasonStarted ? groups.find(g => g.links.some(l => isActive(l.href))) : null;

  return (
    <>
    {/* Horizontal padding comes from `.nav`, which insets by --rail. */}
    <nav className="nav" style={{ gap: 0 }}>

      {/* Left: grouped nav links. The logo used to lead this row; it now lives
          at the far left of the utility bar (TopBar), which is present on every
          page rather than only inside a league. */}
      <div ref={groupsRef} className="nav-groups" style={{ display: "flex", alignItems: "stretch", gap: 0, height: "100%" }}>

        {seasonStarted ? (
          <>
            {groups.map((group) => {
              const isHovered = hoveredGroup === group.label;
              return (
                <div
                  key={group.label}
                  // Trailing margin only, never leading. The old `0 11px` put
                  // 11px in front of the first group, so LEAGUE sat inboard of
                  // the sub-nav's first tab, which starts flush at --rail. The
                  // 22px between groups is unchanged (it was 11 + 11).
                  style={{ position: "relative", display: "flex", alignItems: "stretch", marginRight: 22 }}
                  onMouseEnter={() => setHoveredGroup(group.label)}
                  onMouseLeave={() => setHoveredGroup(null)}
                  // TOUCH. These menus were reachable by hover and nothing
                  // else, which on a phone or tablet means not reachable at
                  // all: there is no pointerenter without a pointing device,
                  // so every link inside LEAGUE and BET was dead on mobile.
                  //
                  // Guarded on pointerType rather than a `(hover: none)` media
                  // query or a touch sniff, so a mouse keeps hover as its only
                  // trigger and does not also toggle on click — and so a
                  // hybrid laptop behaves correctly per input, which a
                  // device-level check cannot do. No hydration risk either,
                  // since nothing is read during render.
                  onPointerDown={e => {
                    if (e.pointerType === "mouse") return;
                    e.preventDefault();
                    setHoveredGroup(g => (g === group.label ? null : group.label));
                  }}
                >
                  <div style={{
                    display: "flex",
                    alignItems: "stretch",
                    padding: 0,
                    fontSize: "0.82rem",
                    fontWeight: 900,
                    letterSpacing: "0.03em",
                    color: "var(--text)",
                    userSelect: "none",
                    whiteSpace: "nowrap",
                    cursor: "default",
                  }}>
                    <span style={{
                      position: "relative",
                      display: "flex",
                      alignItems: "center",
                    }}>
                      {group.label}
                      {/* Filled element rather than an inset box-shadow, and
                          snapped to whole device pixels — see lib/hairline.
                          Always rendered and faded on opacity so the hover
                          still animates, which a mounted/unmounted bar could
                          not do. */}
                      <span
                        aria-hidden="true"
                        style={{
                          position: "absolute",
                          left: 0,
                          right: 0,
                          bottom: 0,
                          height: snapToDevicePx(2.5, dpr),
                          background: "var(--text)",
                          opacity: isHovered ? 1 : 0,
                          transition: "opacity 0.12s",
                        }}
                      />
                    </span>
                    <span style={{ display: "flex", alignItems: "center", marginLeft: 5 }}>
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" style={{ transform: isHovered ? "rotate(180deg)" : "none", transition: "transform 0.15s" }}>
                        <polyline points="6 9 12 15 18 9" />
                      </svg>
                    </span>
                  </div>

                  {isHovered && (
                    <div className="navmenu-panel navmenu-grid" style={{ position: "absolute", top: "100%", left: 0, background: "var(--surface)", border: "none", borderRadius: 0, boxShadow: "var(--shadow-md)", zIndex: 500, padding: "6px 0", display: "grid", gridTemplateColumns: `repeat(2, ${MENU_ITEM_W}px)` }}>
                      {group.links.map(({ label, href }) => (
                        <Link key={href} href={href} className="navmenu-item">
                          <span>{label}</span>
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </>
        ) : (
          <>
            {lobbyLinks.map(({ label, href }) => {
              const active = isActive(href);
              return (
                <Link key={href} href={href} style={{
                  display: "flex", alignItems: "center", padding: "0 14px",
                  fontSize: "0.82rem", fontWeight: 500, color: "var(--text)",
                  textDecoration: "none", whiteSpace: "nowrap",
                  borderBottom: `3.5px solid ${active ? ACCENT : "transparent"}`,
                  transition: "border-color 0.12s",
                }}>
                  {label}
                </Link>
              );
            })}
          </>
        )}
      </div>

      {/* Right: theme toggle + profile + league dropdown */}
      <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8, alignSelf: "stretch" }}>

        {/* League name + dropdown */}
        <div ref={dropdownRef} style={{ position: "relative", alignSelf: "stretch", display: "flex", alignItems: "center" }} onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}
          onPointerDown={e => { if (e.pointerType === "mouse") return; e.preventDefault(); setOpen(o => !o); }}>
          <button
            type="button"
            style={{ display: "flex", alignItems: "center", gap: 5, background: "none", border: "none", padding: "5px 8px", cursor: "pointer", color: "var(--text)", fontWeight: 900, fontSize: "0.82rem", borderRadius: 0, boxShadow: "none", minWidth: 0 }}
          >
            {/* nowrap with no ceiling meant this never yielded a pixel: a name
                like "Dallas Patriots 2026 League" claimed the whole nav and
                starved the group row beside it, which clipped "BET" down to a
                stray "B". .nav-league-name caps and ellipsises it at narrow
                widths so the groups keep their labels. */}
            <span className="nav-league-name" style={{ whiteSpace: "nowrap" }}>
              {currentLeague?.league?.name ?? "Leagues"}
            </span>
            <span style={{ color: "var(--text-2)", flexShrink: 0, transform: open ? "rotate(180deg)" : "none", transition: "transform 0.15s" }}>
              <ChevronDown />
            </span>
          </button>

          {open && (
            <div className="navmenu-panel" style={{ position: "absolute", top: "100%", right: 0, background: "var(--surface)", border: "none", borderRadius: 0, boxShadow: "var(--shadow-md)", width: 230, zIndex: 500, padding: "6px 0" }}>
              {leagues.length === 0 && (
                <div style={{ padding: "10px 14px", fontSize: "0.8rem", color: "var(--text-2)" }}>No leagues</div>
              )}
              {leagues.map((m: any) => (
                <button
                  key={m.leagueId}
                  type="button"
                  className="navmenu-league"
                  onClick={() => { router.push(`/leagues/${m.leagueId}`); setOpen(false); }}
                >
                  <span>
                    <span style={{ fontSize: "0.82rem" }}>
                      {m.league?.name ?? m.leagueId}
                    </span>
                    <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <HelmetAvatar color={m.helmetColor ?? ACCENT} initials={(m.displayName || myDisplayName).slice(0, 2)} size={18} />
                      <span style={{ fontSize: "0.72rem" }}>
                        {m.displayName || myDisplayName}
                      </span>
                    </span>
                  </span>
                </button>
              ))}
              <button
                type="button"
                className="navmenu-league"
                onClick={() => { router.push("/home"); setOpen(false); }}
              >
                <span>+ Add Another League</span>
              </button>
            </div>
          )}
        </div>

        {/* Profile circle */}
        <div ref={profileRef} style={{ position: "relative" }}>
          <button
            type="button"
            onClick={() => setProfileOpen(o => !o)}
            // No disc of its own — the icon draws its own circle, so a second
            // one around it would read as a ring.
            // 26px to match the height of the league dropdown beside it, so the
            // two right-hand controls read as the same size.
            // The icon fills from currentColor, so the button's `color` is what
            // tints it. --text (the near-black) rather than the accent: it sits
            // next to the league name, which is also --text, so the two
            // right-hand controls now read as one group.
            style={{ width: 26, height: 26, borderRadius: "50%", background: "none", border: "none", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text)", cursor: "pointer", boxShadow: "none", padding: 0, flexShrink: 0 }}
          >
            <UserIcon />
          </button>
          {profileOpen && (
            // Same panel treatment as the LEAGUE / BET dropdowns: square, no
            // border, shadow only, 6px of vertical padding. This menu is scoped
            // to the current league — the team name heads it, then a rule, then
            // that team's standing in this league. The global account (real
            // name, email, password, sign out) lives under My Account in the
            // utility bar above, not here.
            <div className="navmenu-panel" style={{ position: "absolute", top: "100%", right: 0, background: "var(--surface)", border: "none", borderRadius: 0, boxShadow: "var(--shadow-md)", zIndex: 500, padding: "6px 0" }}>
              <div className="navmenu-profile is-label">
                <span>{teamName || "—"}</span>
              </div>
              {/* Inset to line up with the rows' inner rectangle rather than
                  running the full width of the panel: 8px of row padding plus
                  9px inside the rectangle. */}
              <div style={{ borderTop: "1px solid var(--border)", margin: "3px 17px" }} />
              {/* Opens the editor mounted at the bottom of this component.
                  It used to push `${base}?edit=profile` and let the home page
                  pick the flag up, which silently did nothing when you were
                  already on the home page — App Router does not remount a page
                  for a query-string-only change, so the effect watching for the
                  parameter never re-ran. */}
              <button
                type="button"
                className="navmenu-profile"
                onClick={() => { setEditorOpen(true); setProfileOpen(false); }}
              >
                <span>Edit Profile</span>
              </button>
              <button
                type="button"
                className="navmenu-profile"
                onClick={() => { router.push(`${base}/settings`); setProfileOpen(false); }}
              >
                <span>League Settings</span>
              </button>
            </div>
          )}
        </div>

      </div>
    </nav>

    {/* Rendered unconditionally but inert until opened: it returns null while
        closed and only fetches once it is open, so every page in the league
        carries it for free. */}
    <LeagueProfileModal leagueId={leagueId} open={editorOpen} onClose={() => setEditorOpen(false)} />

    {/* Sub-nav extension: tabs of the active group */}
    {activeGroup && (
      <div className="subnav-row" style={{
        flexShrink: 0,
        // Same token as .nav above, so the two rows read as ONE band. Left as
        // --surface they would split: a grey bar of groups sitting on a white
        // bar of tabs, which looks like two unrelated strips rather than one
        // nav. The dropdown panels stay --surface deliberately — white on grey
        // is what makes them read as floating above it.
        background: "var(--nav-bg)",
        padding: "0 var(--rail)",
        display: "flex",
        alignItems: "stretch",
        gap: 26,
        height: 40,
        zIndex: 150,
        position: "relative",
        // Deliberately not a scroll container. The active tab's underline sits
        // flush with this row's bottom edge, so any overflow clip here lands
        // exactly on the line and shaves it down to a faint sliver. Tabs are
        // kept from colliding by flexShrink: 0 on each link instead.
      }}>
        {/* Divider between the nav bar and the sub-nav, inset to the content
            rail rather than bleeding to the viewport edges.
            zIndex 0 keeps it in the same stacking layer as the tabs below it:
            as a positioned element it would otherwise paint above the in-flow
            links and lay its hairline across the top of the active tab. */}
        <div style={{ position: "absolute", top: 0, left: "var(--rail)", right: "var(--rail)", height: 1, background: "var(--nav-rule)", zIndex: 0 }} />
        {/* And the same hairline under the sub-nav, closing the row the way the
            one above opens it. Identical treatment on purpose — same colour,
            same 1px, same --rail inset — so the two read as a pair bracketing
            the tabs rather than as two unrelated lines.

            This is what ends the nav. The band is white again, the same as the
            strip above and the page below, so nothing else marks where it
            stops — it was only removable while the nav had a fill of its own to
            end it.

            zIndex 0 for the same reason as the divider above: the active tab's
            accent underline sits flush with this edge and is in normal flow, so
            a positioned line would paint over it and flatten the 3.5px accent
            to a grey hairline. At zIndex 0 the accent wins and the grey rule
            runs under the inactive tabs either side of it, which is what a tab
            bar is supposed to look like. */}
        <div style={{ position: "absolute", bottom: 0, left: "var(--rail)", right: "var(--rail)", height: 1, background: "var(--nav-rule)", zIndex: 0 }} />
        {activeGroup.links.map(({ label, href }) => {
          const active = isActive(href);
          return (
            <Link
              key={href}
              href={href}
              style={{
                display: "flex",
                alignItems: "center",
                fontSize: "0.8rem",
                fontWeight: 500,
                color: active ? "var(--text)" : "var(--text-3)",
                textDecoration: "none",
                whiteSpace: "nowrap",
                transition: "color 0.12s",
                // The label cannot wrap, so a shrunk tab does not get shorter
                // text — it overflows its box and paints over the next tab.
                // Hold every tab at its natural width instead.
                flexShrink: 0,
                // Puts the tabs in the same stacking layer as the divider, so
                // DOM order decides and the tabs (later) win.
                position: "relative",
              }}
              onMouseEnter={e => { if (!active) (e.currentTarget as HTMLAnchorElement).style.color = "var(--text)"; }}
              onMouseLeave={e => { if (!active) (e.currentTarget as HTMLAnchorElement).style.color = "var(--text-3)"; }}
            >
              <span style={{
                position: "relative",
                display: "flex",
                alignItems: "center",
                height: "100%",
              }}>
                {label}
                {/* Filled element rather than an inset box-shadow, snapped to
                    whole device pixels — see lib/hairline. The old shadow left
                    a faint 1px seam up this tab's right edge, which is what
                    made the active tab, and only the active tab, look cut. */}
                {active && (
                  <span
                    aria-hidden="true"
                    style={{
                      position: "absolute",
                      left: 0,
                      right: 0,
                      bottom: 0,
                      height: snapToDevicePx(1.5, dpr),
                      background: "var(--text)",
                    }}
                  />
                )}
              </span>
            </Link>
          );
        })}

      </div>
    )}
    </>
  );
}
