"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import Logo from "@/components/Logo";

function UserIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
      <circle cx="12" cy="7" r="4" />
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
