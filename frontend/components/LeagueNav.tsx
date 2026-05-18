"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { api } from "@/lib/api";
import HelmetAvatar from "@/components/HelmetAvatar";

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

const ACCENT = "#2563EB";

export default function LeagueNav({ leagueId }: { leagueId: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const [leagues, setLeagues] = useState<any[]>([]);
  const [currentLeague, setCurrentLeague] = useState<any>(null);
  const [open, setOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api("/memberships").then((ms: any[]) => {
      setLeagues(ms);
      setCurrentLeague(ms.find((m: any) => m.leagueId === leagueId) ?? null);
    }).catch(() => {});
  }, [leagueId]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) setOpen(false);
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) setProfileOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  function logout() {
    localStorage.removeItem("token");
    localStorage.removeItem("userId");
    router.push("/");
  }

  const base = `/leagues/${leagueId}`;
  const links = [
    { label: "Home",    href: base },
    { label: "Bet",     href: `${base}/bet` },
    { label: "My Bets", href: `${base}/mybets` },
  ];

  function isActive(href: string) {
    if (href === base) return pathname === base;
    return pathname.startsWith(href);
  }

  return (
    <nav className="nav" style={{ gap: 0, padding: "0 12px" }}>

      {/* Center: page links */}
      <div style={{ position: "absolute", left: "50%", transform: "translateX(-50%)", display: "flex", alignItems: "stretch", height: "100%" }}>
        {links.map(({ label, href }) => {
          const active = isActive(href);
          return (
            <Link
              key={href}
              href={href}
              style={{
                display: "flex",
                alignItems: "center",
                padding: "0 13px",
                fontSize: "0.82rem",
                fontWeight: 500,
                color: "var(--text-2)",
                borderBottom: `3px solid ${active ? ACCENT : "transparent"}`,
                transition: "color 0.12s, border-color 0.12s",
                whiteSpace: "nowrap",
                textDecoration: "none",
              }}
              onMouseEnter={e => {
                if (!active) {
                  (e.currentTarget as HTMLAnchorElement).style.borderBottomColor = ACCENT;
                }
              }}
              onMouseLeave={e => {
                if (!active) {
                  (e.currentTarget as HTMLAnchorElement).style.borderBottomColor = "transparent";
                }
              }}
            >
              {label}
            </Link>
          );
        })}
      </div>

      {/* Right: profile + league dropdown */}
      <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>

        {/* League name + dropdown */}
        <div ref={dropdownRef} style={{ position: "relative" }}>
          <button
            type="button"
            onClick={() => setOpen(o => !o)}
            style={{ display: "flex", alignItems: "center", gap: 5, background: "none", border: "none", padding: "5px 8px", cursor: "pointer", color: "var(--text)", fontWeight: 500, fontSize: "0.82rem", borderRadius: 0, transition: "background 0.12s", boxShadow: "none" }}
            onMouseEnter={undefined}
            onMouseLeave={undefined}
          >
            <span style={{ whiteSpace: "nowrap" }}>
              {currentLeague?.league?.name ?? "Leagues"}
            </span>
            <span style={{ color: "var(--text-3)", flexShrink: 0, transform: open ? "rotate(180deg)" : "none", transition: "transform 0.15s" }}>
              <ChevronDown />
            </span>
          </button>

          {open && (
            <div style={{ position: "absolute", top: "calc(100% + 6px)", right: 0, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)", boxShadow: "var(--shadow-md)", minWidth: 230, zIndex: 500, overflow: "hidden" }}>
              {leagues.length === 0 && (
                <div style={{ padding: "10px 14px", fontSize: "0.8rem", color: "var(--text-3)" }}>No leagues</div>
              )}
              {leagues.map((m: any) => {
                const active = m.leagueId === leagueId;
                return (
                  <button
                    key={m.leagueId}
                    type="button"
                    onClick={() => { router.push(`/leagues/${m.leagueId}`); setOpen(false); }}
                    style={{ display: "block", width: "100%", textAlign: "left", padding: "10px 14px", background: active ? "var(--accent-dim)" : "none", border: "none", borderBottom: "1px solid var(--border)", cursor: "pointer", boxShadow: "none", borderRadius: 0, transition: "background 0.1s" }}
                    onMouseEnter={e => { if (!active) e.currentTarget.style.background = "var(--surface-2)"; }}
                    onMouseLeave={e => { if (!active) e.currentTarget.style.background = "none"; }}
                  >
                    <div style={{ fontSize: "0.82rem", fontWeight: 500, color: "var(--text)", marginBottom: 5 }}>
                      {m.league?.name ?? m.leagueId}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <HelmetAvatar color={m.helmetColor ?? ACCENT} initials={(m.displayName || "?").slice(0, 2)} size={18} />
                      <span style={{ fontSize: "0.72rem", color: "var(--text-3)", fontWeight: 500 }}>
                        {m.displayName || "—"}
                      </span>
                    </div>
                  </button>
                );
              })}
              <div style={{ padding: "6px 8px" }}>
                <button type="button" onClick={() => { router.push("/leagues"); setOpen(false); }} style={{ display: "block", width: "100%", textAlign: "left", padding: "7px 8px", background: "none", border: "none", cursor: "pointer", fontSize: "0.75rem", fontWeight: 600, color: ACCENT, boxShadow: "none", borderRadius: 4, transition: "background 0.1s" }} onMouseEnter={e => (e.currentTarget.style.background = "var(--accent-dim)")} onMouseLeave={e => (e.currentTarget.style.background = "none")}>
                  + All Leagues
                </button>
              </div>
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
  );
}
