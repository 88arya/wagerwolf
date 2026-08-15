"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { api } from "@/lib/api";
import HelmetAvatar from "@/components/HelmetAvatar";
import { ACCENT } from "@/lib/constants";
import Logo from "@/components/Logo";

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

// Outlined person-in-circle, used beside the name at the head of the profile
// menu. Filled paths cut with evenodd, so it takes its colour from currentColor
// and ignores strokeWidth — same as UserIcon below.
function AccountIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" style={{ flexShrink: 0 }}>
      <g fillRule="evenodd" clipRule="evenodd">
        <path d="M16 9a4 4 0 1 1-8 0a4 4 0 0 1 8 0m-2 0a2 2 0 1 1-4 0a2 2 0 0 1 4 0" />
        <path d="M12 1C5.925 1 1 5.925 1 12s4.925 11 11 11s11-4.925 11-11S18.075 1 12 1M3 12c0 2.09.713 4.014 1.908 5.542A8.99 8.99 0 0 1 12.065 14a8.98 8.98 0 0 1 7.092 3.458A9 9 0 1 0 3 12m9 9a8.96 8.96 0 0 1-5.672-2.012A6.99 6.99 0 0 1 12.065 16a6.99 6.99 0 0 1 5.689 2.92A8.96 8.96 0 0 1 12 21" />
      </g>
    </svg>
  );
}

// Solid person-in-circle. Filled rather than stroked, so it takes `fill` from
// currentColor and ignores strokeWidth. Duplicated verbatim in UserNav — keep
// the two in step.
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
  const [myFullName, setMyFullName] = useState("");
  const [open, setOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [hoveredGroup, setHoveredGroup] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);
  const navStartedRef = useRef(false);

  useEffect(() => {
    api("/users/me").then((u: any) => {
      setMyDisplayName(u.displayName || u.name || "");
      // Falls back to the display name for accounts that predate onboarding and
      // so have no first/last on record.
      const full = [u.firstName, u.lastName].filter(Boolean).join(" ");
      setMyFullName(full || u.displayName || u.name || "");
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

  function logout() {
    localStorage.removeItem("token");
    localStorage.removeItem("userId");
    router.push("/");
  }

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
    <nav className="nav" style={{ gap: 0, padding: "0 300px" }}>

      {/* Left: logo + grouped nav links */}
      <div style={{ display: "flex", alignItems: "stretch", gap: 0, height: "100%" }}>

        {/* Logo */}
        <Link href="/home" style={{ paddingTop: 0, paddingLeft: 0, paddingBottom: 0, paddingRight: 16, display: "flex", alignItems: "center", marginRight: 4 }}>
          <Logo size={28} />
        </Link>

        {seasonStarted ? (
          <>
            {groups.map((group) => {
              const isHovered = hoveredGroup === group.label;
              return (
                <div
                  key={group.label}
                  style={{ position: "relative", display: "flex", alignItems: "stretch", margin: "0 11px" }}
                  onMouseEnter={() => setHoveredGroup(group.label)}
                  onMouseLeave={() => setHoveredGroup(null)}
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
                      display: "flex",
                      alignItems: "center",
                      boxShadow: isHovered ? "inset 0 -2.5px 0 var(--text)" : "none",
                      transition: "box-shadow 0.12s",
                    }}>
                      {group.label}
                    </span>
                    <span style={{ display: "flex", alignItems: "center", marginLeft: 5 }}>
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" style={{ transform: isHovered ? "rotate(180deg)" : "none", transition: "transform 0.15s" }}>
                        <polyline points="6 9 12 15 18 9" />
                      </svg>
                    </span>
                  </div>

                  {isHovered && (
                    <div style={{ position: "absolute", top: "100%", left: 0, background: "var(--surface)", border: "none", borderRadius: 0, boxShadow: "var(--shadow-md)", zIndex: 500, padding: "6px 0", display: "grid", gridTemplateColumns: `repeat(2, ${MENU_ITEM_W}px)` }}>
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
        <div ref={dropdownRef} style={{ position: "relative", alignSelf: "stretch", display: "flex", alignItems: "center" }} onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
          <button
            type="button"
            style={{ display: "flex", alignItems: "center", gap: 5, background: "none", border: "none", padding: "5px 8px", cursor: "pointer", color: "var(--text)", fontWeight: 500, fontSize: "0.82rem", borderRadius: 0, boxShadow: "none" }}
          >
            <span style={{ whiteSpace: "nowrap" }}>
              {currentLeague?.league?.name ?? "Leagues"}
            </span>
            <span style={{ color: "var(--text-2)", flexShrink: 0, transform: open ? "rotate(180deg)" : "none", transition: "transform 0.15s" }}>
              <ChevronDown />
            </span>
          </button>

          {open && (
            <div style={{ position: "absolute", top: "100%", right: 0, background: "var(--surface)", border: "none", borderRadius: 0, boxShadow: "var(--shadow-md)", width: 230, zIndex: 500, padding: "6px 0" }}>
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
                onClick={() => { router.push("/leagues"); setOpen(false); }}
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
            // tints it — accent blue rather than the grey the nav uses for text.
            style={{ width: 26, height: 26, borderRadius: "50%", background: "none", border: "none", display: "flex", alignItems: "center", justifyContent: "center", color: ACCENT, cursor: "pointer", boxShadow: "none", padding: 0, flexShrink: 0 }}
          >
            <UserIcon />
          </button>
          {profileOpen && (
            // Same panel treatment as the LEAGUE / BET dropdowns: square, no
            // border, shadow only, 6px of vertical padding. The email is a
            // label row, then a rule, then the two actions.
            <div style={{ position: "absolute", top: "100%", right: 0, background: "var(--surface)", border: "none", borderRadius: 0, boxShadow: "var(--shadow-md)", zIndex: 500, padding: "6px 0" }}>
              <div className="navmenu-profile is-label">
                <span style={{ gap: 8 }}>
                  <AccountIcon />
                  {myFullName || "—"}
                </span>
              </div>
              {/* Inset to line up with the rows' inner rectangle rather than
                  running the full width of the panel: 8px of row padding plus
                  9px inside the rectangle. */}
              <div style={{ borderTop: "1px solid var(--border)", margin: "3px 17px" }} />
              <button type="button" className="navmenu-profile" onClick={() => { router.push("/settings"); setProfileOpen(false); }}>
                <span>Edit profile</span>
              </button>
              <button type="button" className="navmenu-profile" onClick={logout}>
                <span>Sign out</span>
              </button>
            </div>
          )}
        </div>

      </div>
    </nav>

    {/* Sub-nav extension: tabs of the active group */}
    {activeGroup && (
      <div style={{
        flexShrink: 0,
        background: "var(--surface)",
        padding: "0 300px",
        display: "flex",
        alignItems: "stretch",
        gap: 26,
        height: 40,
        zIndex: 150,
        position: "relative",
      }}>
        {/* Divider between the nav bar and the sub-nav, inset to the content
            rail rather than bleeding to the viewport edges. */}
        <div style={{ position: "absolute", top: 0, left: 300, right: 300, height: 1, background: "var(--border)" }} />
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
              }}
              onMouseEnter={e => { if (!active) (e.currentTarget as HTMLAnchorElement).style.color = "var(--text)"; }}
              onMouseLeave={e => { if (!active) (e.currentTarget as HTMLAnchorElement).style.color = "var(--text-3)"; }}
            >
              <span style={{
                display: "flex",
                alignItems: "center",
                height: "100%",
                boxShadow: active ? "inset 0 -1.25px 0 var(--text)" : "none",
              }}>
                {label}
              </span>
            </Link>
          );
        })}

      </div>
    )}
    </>
  );
}
