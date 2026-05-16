"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

function HomeIcon({ active }: { active: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.2 : 1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </svg>
  );
}

function TicketIcon({ active }: { active: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.2 : 1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M15 5v2m0 4v2m0 4v2M5 5a2 2 0 00-2 2v3a2 2 0 110 4v3a2 2 0 002 2h14a2 2 0 002-2v-3a2 2 0 110-4V7a2 2 0 00-2-2H5z" />
    </svg>
  );
}


function ReceiptIcon({ active }: { active: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.2 : 1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 00-2 2v16l3-2 2 2 2-2 2 2 2-2 3 2V4a2 2 0 00-2-2z" />
      <line x1="16" y1="8" x2="8" y2="8" />
      <line x1="16" y1="12" x2="8" y2="12" />
      <line x1="12" y1="16" x2="8" y2="16" />
    </svg>
  );
}

function GearIcon({ active }: { active: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.2 : 1.8} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
    </svg>
  );
}

const BASE_TABS = [
  { label: "Home",     Icon: HomeIcon,     path: "" },
  { label: "Bet",      Icon: TicketIcon,   path: "/bet" },
  { label: "My Bets",  Icon: ReceiptIcon,  path: "/mybets" },
];

const COMMISSIONER_TAB = { label: "Manage", Icon: GearIcon, path: "/settings" };

export default function BottomNav({ leagueId, isCreator }: { leagueId: string; isCreator?: boolean }) {
  const pathname = usePathname();
  const tabs = isCreator ? [...BASE_TABS, COMMISSIONER_TAB] : BASE_TABS;

  return (
    <nav className="bottom-nav">
      {tabs.map(({ label, Icon, path }) => {
        const href = `/leagues/${leagueId}${path}`;
        const active = path === "" ? pathname === href : pathname.startsWith(href);
        return (
          <Link key={href} href={href} className={`bottom-nav-item${active ? " active" : ""}`}>
            <span className="bottom-nav-icon">
              <Icon active={active} />
            </span>
            <span>{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
