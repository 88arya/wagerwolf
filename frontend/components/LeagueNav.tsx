"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { api } from "@/lib/api";
import HelmetAvatar from "@/components/HelmetAvatar";
import { ACCENT } from "@/lib/constants";
import { fmtMoney } from "@/lib/money";
import Logo from "@/components/Logo";
import ThemeToggle from "@/components/ThemeToggle";

function ChevronDown() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

function UserIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
      <circle cx="12" cy="7" r="4" />
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
  const [hoveredGroup, setHoveredGroup] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);
  const navStartedRef = useRef(false);

  useEffect(() => {
    api("/users/me").then((u: any) => setMyDisplayName(u.displayName || u.name || "")).catch(() => {});
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
                    <div style={{ position: "absolute", top: "100%", left: 0, background: "var(--surface)", border: "1px solid var(--border-2)", borderRadius: "var(--radius-sm)", boxShadow: "var(--shadow-md)", minWidth: 280, zIndex: 500, overflow: "hidden", display: "grid", gridTemplateColumns: "1fr 1fr" }}>
                      {group.links.map(({ label, href }) => {
                        return (
                          <Link
                            key={href}
                            href={href}
                            style={{
                              display: "block",
                              padding: "9px 14px",
                              fontSize: "0.82rem",
                              fontWeight: 500,
                              color: "var(--text)",
                              background: "none",
                              textDecoration: "none",
                              transition: "background 0.1s, color 0.1s",
                            }}
                            onMouseEnter={e => { const el = e.currentTarget as HTMLAnchorElement; el.style.background = ACCENT; el.style.color = "#fff"; }}
                            onMouseLeave={e => { const el = e.currentTarget as HTMLAnchorElement; el.style.background = "none"; el.style.color = "var(--text)"; }}
                          >
                            {label}
                          </Link>
                        );
                      })}
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
        <ThemeToggle />

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
            <div style={{ position: "absolute", top: "100%", right: 0, background: "var(--surface)", border: "1px solid var(--border-2)", borderRadius: "var(--radius-sm)", boxShadow: "var(--shadow-md)", minWidth: 230, zIndex: 500, overflow: "hidden" }}>
              {leagues.length === 0 && (
                <div style={{ padding: "10px 14px", fontSize: "0.8rem", color: "var(--text-2)" }}>No leagues</div>
              )}
              {leagues.map((m: any) => {
                const active = m.leagueId === leagueId;
                return (
                  <button
                    key={m.leagueId}
                    type="button"
                    onClick={() => { router.push(`/leagues/${m.leagueId}`); setOpen(false); }}
                    style={{ display: "block", width: "100%", textAlign: "left", padding: "10px 14px", background: "none", border: "none", borderBottom: "none", cursor: "pointer", boxShadow: "none", borderRadius: 0, color: "var(--text)", transition: "background 0.1s, color 0.1s" }}
                    onMouseEnter={e => { e.currentTarget.style.background = ACCENT; e.currentTarget.style.color = "#fff"; }}
                    onMouseLeave={e => { e.currentTarget.style.background = "none"; e.currentTarget.style.color = "var(--text)"; }}
                  >
                    <div style={{ fontSize: "0.82rem", fontWeight: 500, marginBottom: 5 }}>
                      {m.league?.name ?? m.leagueId}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <HelmetAvatar color={m.helmetColor ?? ACCENT} initials={(m.displayName || myDisplayName).slice(0, 2)} size={18} />
                      <span style={{ fontSize: "0.72rem", fontWeight: 500 }}>
                        {m.displayName || myDisplayName}
                      </span>
                    </div>
                  </button>
                );
              })}
              <button
                type="button"
                onClick={() => { router.push("/leagues"); setOpen(false); }}
                style={{ display: "block", width: "100%", textAlign: "left", padding: "10px 14px", background: "none", border: "none", cursor: "pointer", fontSize: "0.82rem", fontWeight: 500, color: "var(--text)", boxShadow: "none", borderRadius: 0, transition: "background 0.1s, color 0.1s" }}
                onMouseEnter={e => { e.currentTarget.style.background = ACCENT; e.currentTarget.style.color = "#fff"; }}
                onMouseLeave={e => { e.currentTarget.style.background = "none"; e.currentTarget.style.color = "var(--text)"; }}
              >
                + Add Another League
              </button>
            </div>
          )}
        </div>

        {/* Profile circle */}
        <div ref={profileRef} style={{ position: "relative" }}>
          <button
            type="button"
            onClick={() => setProfileOpen(o => !o)}
            style={{ width: 32, height: 32, borderRadius: "50%", background: "var(--surface-3)", border: "1px solid var(--border-2)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-2)", cursor: "pointer", boxShadow: "none", padding: 0, flexShrink: 0 }}
          >
            <UserIcon />
          </button>
          {profileOpen && (
            <div style={{ position: "absolute", top: "calc(100% + 6px)", right: 0, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)", boxShadow: "var(--shadow-md)", minWidth: 140, zIndex: 500, overflow: "hidden" }}>
              <button type="button" onClick={() => { router.push("/settings"); setProfileOpen(false); }} style={{ display: "block", width: "100%", textAlign: "left", padding: "9px 14px", background: "none", border: "none", cursor: "pointer", fontSize: "0.82rem", fontWeight: 500, color: "var(--text)", boxShadow: "none", borderRadius: 0, transition: "background 0.1s" }} onMouseEnter={e => (e.currentTarget.style.background = "var(--surface-2)")} onMouseLeave={e => (e.currentTarget.style.background = "none")}>Settings</button>
              <div style={{ borderTop: "1px solid var(--border)" }} />
              <button type="button" onClick={logout} style={{ display: "block", width: "100%", textAlign: "left", padding: "9px 14px", background: "none", border: "none", cursor: "pointer", fontSize: "0.82rem", fontWeight: 500, color: "var(--loss)", boxShadow: "none", borderRadius: 0, transition: "background 0.1s" }} onMouseEnter={e => (e.currentTarget.style.background = "var(--surface-2)")} onMouseLeave={e => (e.currentTarget.style.background = "none")}>Log out</button>
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
        borderBottom: "1px solid var(--border)",
        padding: "0 300px",
        display: "flex",
        alignItems: "stretch",
        gap: 26,
        height: 40,
        zIndex: 150,
        position: "relative",
      }}>
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

        {currentLeague && (
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: "0.65rem", fontWeight: 600, letterSpacing: "0.04em", color: "var(--text-3)", textTransform: "uppercase" }}>
              Balance
            </span>
            <span style={{ fontSize: "0.8rem", fontWeight: 700, color: "var(--text)", fontVariantNumeric: "tabular-nums" }}>
              {fmtMoney(currentLeague.balance ?? 0)}
            </span>
          </div>
        )}
      </div>
    )}
    </>
  );
}
