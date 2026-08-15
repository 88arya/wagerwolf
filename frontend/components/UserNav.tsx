"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import Logo from "@/components/Logo";
import { ACCENT } from "@/lib/constants";

// Solid person-in-circle. Filled rather than stroked, so it takes `fill` from
// currentColor and ignores strokeWidth. Duplicated verbatim in LeagueNav — keep
// the two in step.
function UserIcon() {
  return (
    <svg width="26" height="26" viewBox="0 0 512 512" fill="currentColor" aria-hidden="true">
      <path fillRule="evenodd" d="M256 42.667A213.333 213.333 0 0 1 469.334 256c0 117.821-95.513 213.334-213.334 213.334c-117.82 0-213.333-95.513-213.333-213.334C42.667 138.18 138.18 42.667 256 42.667m21.334 234.667h-42.667c-52.815 0-98.158 31.987-117.715 77.648c30.944 43.391 81.692 71.685 139.048 71.685s108.104-28.294 139.049-71.688c-19.557-45.658-64.9-77.645-117.715-77.645M256 106.667c-35.346 0-64 28.654-64 64s28.654 64 64 64s64-28.654 64-64s-28.653-64-64-64" />
    </svg>
  );
}

const LINKS = [
  { label: "Home", href: "/home" },
  { label: "My Leagues", href: "/leagues" },
];

export default function UserNav() {
  const pathname = usePathname();
  const router = useRouter();
  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) setProfileOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  function logout() {
    localStorage.removeItem("token");
    localStorage.removeItem("userId");
    localStorage.removeItem("displayName");
    router.push("/");
  }

  return (
    <nav className="nav" style={{ gap: 0, padding: "0 300px" }}>

      {/* Left: logo + nav links */}
      <div style={{ display: "flex", alignItems: "stretch", gap: 0, height: "100%" }}>
        <Link href="/home" style={{ paddingTop: 0, paddingLeft: 0, paddingBottom: 0, paddingRight: 16, display: "flex", alignItems: "center", marginRight: 4 }}>
          <Logo size={28} />
        </Link>

        {LINKS.map(({ label, href }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link key={href} href={href} style={{
              display: "flex", alignItems: "center", padding: "0 14px",
              fontSize: "0.82rem", fontWeight: 900, letterSpacing: "0.03em",
              color: "var(--text)", textDecoration: "none", whiteSpace: "nowrap",
              textTransform: "uppercase",
            }}>
              <span style={{
                display: "flex",
                alignItems: "center",
                height: "100%",
                boxShadow: active ? "inset 0 -2.5px 0 var(--text)" : "none",
                transition: "box-shadow 0.12s",
              }}>
                {label}
              </span>
            </Link>
          );
        })}
      </div>

      {/* Right: theme toggle + profile */}
      <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
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
