"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { api } from "@/lib/api";
import HelmetAvatar from "@/components/HelmetAvatar";
import UserIcon from "@/components/UserIcon";
import LeagueProfileModal from "@/components/LeagueProfileModal";
import { ACCENT } from "@/lib/constants";
import { useDevicePixelRatio, snapToDevicePx } from "@/lib/hairline";
import type { Me, MyMembership } from "@/lib/types";

const MENU_ITEM_W = 140;

function ChevronDown() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

export default function LeagueNav({ leagueId }: { leagueId: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const [leagues, setLeagues] = useState<MyMembership[]>([]);
  const [currentLeague, setCurrentLeague] = useState<MyMembership | null>(null);
  const [myDisplayName, setMyDisplayName] = useState("");
  const [open, setOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [hoveredGroup, setHoveredGroup] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const groupsRef = useRef<HTMLDivElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);
  const navStartedRef = useRef(false);

  const dpr = useDevicePixelRatio();

  useEffect(() => {
    api<Me>("/users/me").then((u) => {
      setMyDisplayName(u.displayName || "");
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (navStartedRef.current) return;
    api<MyMembership[]>("/memberships").then((ms) => {
      setLeagues(ms);
      const match = ms.find((m) => m.leagueId === leagueId) ?? null;
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
      api<MyMembership[]>("/memberships").then((ms) => {
        setLeagues(ms);
        const match = ms.find((m) => m.leagueId === leagueId) ?? null;
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
    <nav className="nav" style={{ gap: 0 }}>

      <div ref={groupsRef} className="nav-groups" style={{ display: "flex", alignItems: "stretch", gap: 0, height: "100%" }}>

        {seasonStarted ? (
          <>
            {groups.map((group) => {
              const isHovered = hoveredGroup === group.label;
              return (
                <div
                  key={group.label}
                  style={{ position: "relative", display: "flex", alignItems: "stretch", marginRight: 22 }}
                  onMouseEnter={() => setHoveredGroup(group.label)}
                  onMouseLeave={() => setHoveredGroup(null)}
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

      <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8, alignSelf: "stretch" }}>

        <div ref={dropdownRef} style={{ position: "relative", alignSelf: "stretch", display: "flex", alignItems: "center" }} onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}
          onPointerDown={e => { if (e.pointerType === "mouse") return; e.preventDefault(); setOpen(o => !o); }}>
          <button
            type="button"
            style={{ display: "flex", alignItems: "center", gap: 5, background: "none", border: "none", padding: "5px 8px", cursor: "pointer", color: "var(--text)", fontWeight: 900, fontSize: "0.82rem", borderRadius: 0, boxShadow: "none", minWidth: 0 }}
          >
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
              {leagues.map((m) => (
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

        <div ref={profileRef} style={{ position: "relative" }}>
          <button
            type="button"
            onClick={() => setProfileOpen(o => !o)}
            style={{ width: 26, height: 26, borderRadius: "50%", background: "none", border: "none", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text)", cursor: "pointer", boxShadow: "none", padding: 0, flexShrink: 0 }}
          >
            <UserIcon />
          </button>
          {profileOpen && (
            <div className="navmenu-panel" style={{ position: "absolute", top: "100%", right: 0, background: "var(--surface)", border: "none", borderRadius: 0, boxShadow: "var(--shadow-md)", zIndex: 500, padding: "6px 0" }}>
              <div className="navmenu-profile is-label">
                <span>{teamName || "—"}</span>
              </div>
              <div style={{ borderTop: "1px solid var(--border)", margin: "3px 17px" }} />
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

    <LeagueProfileModal leagueId={leagueId} open={editorOpen} onClose={() => setEditorOpen(false)} />

    {activeGroup && (
      <div className="subnav-row" style={{
        flexShrink: 0,
        background: "var(--nav-bg)",
        padding: "0 var(--rail)",
        display: "flex",
        alignItems: "stretch",
        gap: 26,
        height: 40,
        zIndex: 150,
        position: "relative",
      }}>
        <div style={{ position: "absolute", top: 0, left: "var(--rail)", right: "var(--rail)", height: 1, background: "var(--nav-rule)", zIndex: 0 }} />
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
                flexShrink: 0,
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
