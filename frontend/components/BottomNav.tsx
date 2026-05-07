"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { label: "Home",    icon: "⬡", path: "" },
  { label: "Bet",     icon: "◎", path: "/bet" },
  { label: "History", icon: "◷", path: "/history" },
  { label: "Ranks",   icon: "◆", path: "/leaderboard" },
];

export default function BottomNav({ leagueId }: { leagueId: string }) {
  const pathname = usePathname();

  return (
    <nav className="bottom-nav">
      {TABS.map(({ label, icon, path }) => {
        const href = `/leagues/${leagueId}${path}`;
        const active = path === ""
          ? pathname === href
          : pathname.startsWith(href);
        return (
          <Link key={href} href={href} className={`bottom-nav-item${active ? " active" : ""}`}>
            <span className="bottom-nav-icon">{icon}</span>
            <span>{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
