"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { api } from "@/lib/api";

function ChevronDown() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

function UserIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
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
  const [open, setOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api("/memberships").then((ms: any[]) => {
      setLeagues(ms);
      const current = ms.find((m: any) => m.leagueId === leagueId);
      setCurrentLeague(current);
    }).catch(() => {});
  }, [leagueId]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setProfileOpen(false);
      }
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
      {/* Left: Leagues dropdown */}
      <div ref={dropdownRef} style={{ position: "relative" }}>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          style={{
            display: "flex", alignItems: "center", gap: 5,
            background: "none", border: "none", padding: "5px 8px",
            cursor: "pointer", color: "var(--text)", fontWeight: 700,
            fontSize: "0.82rem", borderRadius: 6,
            transition: "background 0.12s",
            boxShadow: "none",
          }}
          onMouseEnter={e => (e.currentTarget.style.background = "var(--surface-2)")}
          onMouseLeave={e => (e.currentTarget.style.background = "none")}
        >
          <span style={{ maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {currentLeague?.league?.name ?? "Leagues"}
          </span>
          <span style={{ color: "var(--text-3)", flexShrink: 0, transform: open ? "rotate(180deg)" : "none", transition: "transform 0.15s" }}>
            <ChevronDown />
          </span>
        </button>

        {open && (
          <div style={{
            position: "absolute", top: "calc(100% + 6px)", left: 0,
            background: "var(--surface)", border: "1px solid var(--border)",
            borderRadius: "var(--radius)", boxShadow: "var(--shadow-md)",
            minWidth: 200, zIndex: 500, overflow: "hidden",
          }}>
            {leagues.length === 0 && (
              <div style={{ padding: "10px 14px", fontSize: "0.8rem", color: "var(--text-3)" }}>No leagues</div>
            )}
            {leagues.map((m: any) => (
              <button
                key={m.leagueId}
                type="button"
                onClick={() => { router.push(`/leagues/${m.leagueId}`); setOpen(false); }}
                style={{
                  display: "block", width: "100%", textAlign: "left",
                  padding: "9px 14px", background: m.leagueId === leagueId ? "var(--accent-dim)" : "none",
                  border: "none", cursor: "pointer", fontSize: "0.82rem",
                  fontWeight: m.leagueId === leagueId ? 700 : 500,
                  color: m.leagueId === leagueId ? "var(--accent)" : "var(--text)",
                  boxShadow: "none", borderRadius: 0,
                  transition: "background 0.1s",
                }}
                onMouseEnter={e => { if (m.leagueId !== leagueId) e.currentTarget.style.background = "var(--surface-2)"; }}
                onMouseLeave={e => { if (m.leagueId !== leagueId) e.currentTarget.style.background = "none"; }}
              >
                {m.league?.name ?? m.leagueId}
              </button>
            ))}
            <div style={{ borderTop: "1px solid var(--border)", padding: "6px 8px" }}>
              <button
                type="button"
                onClick={() => { router.push("/leagues"); setOpen(false); }}
                style={{
                  display: "block", width: "100%", textAlign: "left",
                  padding: "7px 8px", background: "none", border: "none",
                  cursor: "pointer", fontSize: "0.75rem", fontWeight: 600,
                  color: "var(--accent)", boxShadow: "none", borderRadius: 4,
                  transition: "background 0.1s",
                }}
                onMouseEnter={e => (e.currentTarget.style.background = "var(--accent-dim)")}
                onMouseLeave={e => (e.currentTarget.style.background = "none")}
              >
                + All Leagues
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Center: Home / Bet / My Bets */}
      <div style={{ display: "flex", alignItems: "center", gap: 2, position: "absolute", left: "50%", transform: "translateX(-50%)" }}>
        {links.map(({ label, href }) => (
          <Link
            key={href}
            href={href}
            style={{
              padding: "5px 11px", borderRadius: 6,
              fontSize: "0.82rem", fontWeight: isActive(href) ? 700 : 600,
              color: isActive(href) ? "var(--accent)" : "var(--text-2)",
              background: isActive(href) ? "var(--accent-dim)" : "none",
              transition: "color 0.12s, background 0.12s",
              whiteSpace: "nowrap",
            }}
          >
            {label}
          </Link>
        ))}
      </div>

      {/* Right: Profile */}
      <div ref={profileRef} style={{ marginLeft: "auto", position: "relative" }}>
        <button
          type="button"
          onClick={() => setProfileOpen((o) => !o)}
          style={{
            width: 34, height: 34, borderRadius: "50%",
            background: "var(--surface-3)", border: "1px solid var(--border-2)",
            display: "flex", alignItems: "center", justifyContent: "center",
            color: "var(--text-2)", cursor: "pointer", boxShadow: "none",
            padding: 0,
          }}
        >
          <UserIcon />
        </button>
        {profileOpen && (
          <div style={{
            position: "absolute", top: "calc(100% + 6px)", right: 0,
            background: "var(--surface)", border: "1px solid var(--border)",
            borderRadius: "var(--radius)", boxShadow: "var(--shadow-md)",
            minWidth: 140, zIndex: 500, overflow: "hidden",
          }}>
            <button
              type="button"
              onClick={() => { router.push("/settings"); setProfileOpen(false); }}
              style={{
                display: "block", width: "100%", textAlign: "left",
                padding: "9px 14px", background: "none", border: "none",
                cursor: "pointer", fontSize: "0.82rem", fontWeight: 500,
                color: "var(--text)", boxShadow: "none", borderRadius: 0,
                transition: "background 0.1s",
              }}
              onMouseEnter={e => (e.currentTarget.style.background = "var(--surface-2)")}
              onMouseLeave={e => (e.currentTarget.style.background = "none")}
            >
              Settings
            </button>
            <div style={{ borderTop: "1px solid var(--border)" }} />
            <button
              type="button"
              onClick={logout}
              style={{
                display: "block", width: "100%", textAlign: "left",
                padding: "9px 14px", background: "none", border: "none",
                cursor: "pointer", fontSize: "0.82rem", fontWeight: 500,
                color: "var(--loss)", boxShadow: "none", borderRadius: 0,
                transition: "background 0.1s",
              }}
              onMouseEnter={e => (e.currentTarget.style.background = "var(--surface-2)")}
              onMouseLeave={e => (e.currentTarget.style.background = "none")}
            >
              Log out
            </button>
          </div>
        )}
      </div>
    </nav>
  );
}
