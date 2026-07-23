"use client";

import { useEffect, useState } from "react";

function SunIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
      <circle cx="12" cy="12" r="4" />
      <line x1="12" y1="2" x2="12" y2="4" /><line x1="12" y1="20" x2="12" y2="22" />
      <line x1="4.5" y1="4.5" x2="5.9" y2="5.9" /><line x1="18.1" y1="18.1" x2="19.5" y2="19.5" />
      <line x1="2" y1="12" x2="4" y2="12" /><line x1="20" y1="12" x2="22" y2="12" />
      <line x1="4.5" y1="19.5" x2="5.9" y2="18.1" /><line x1="18.1" y1="5.9" x2="19.5" y2="4.5" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
    </svg>
  );
}

export default function ThemeToggle() {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    setDark(document.documentElement.dataset.theme === "dark");
  }, []);

  function toggle() {
    const next = !dark;
    setDark(next);
    if (next) document.documentElement.dataset.theme = "dark";
    else delete document.documentElement.dataset.theme;
    try { localStorage.setItem("theme", next ? "dark" : "light"); } catch {}
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
      style={{
        width: 32, height: 32, borderRadius: "50%",
        background: "var(--surface-3)", border: "1px solid var(--border-2)",
        display: "flex", alignItems: "center", justifyContent: "center",
        color: "var(--text-2)", cursor: "pointer", boxShadow: "none", padding: 0, flexShrink: 0,
      }}
    >
      {dark ? <SunIcon /> : <MoonIcon />}
    </button>
  );
}
