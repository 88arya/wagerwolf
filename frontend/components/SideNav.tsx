"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { api } from "@/lib/api";
import { getCached, readCached, setCached } from "@/lib/pageCache";
import AccountMenu from "@/components/AccountMenu";
import LogoWordmark from "@/components/LogoWordmark";
import SideNavGames from "@/components/SideNavGames";
import UserIcon from "@/components/UserIcon";
import type { MyMembership } from "@/lib/types";
import { Caret, HomeIcon, LeagueShield } from "./sidenav/icons";
import { HelpMenu, LeaguesMenu, SHELL_MENU_GAP } from "./sidenav/menus";

const LOCKUP_H = 22;
const AVATAR_ICON = 16;

/** `/leagues/<id>/anything` -> `<id>`, so every page in a league lights its row. */
const LEAGUE_ROUTE = /^\/leagues\/([^/]+)/;

type League = { id: string; name: string; color: string | null };

function Label({
  href,
  icon,
  name,
  active,
}: {
  href: string;
  icon: React.ReactNode;
  name: string;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={`sidenav-item${active ? " is-active" : ""}`}
      aria-current={active ? "page" : undefined}
      title={name}
    >
      {icon}
      <span>{name}</span>
    </Link>
  );
}

function Section({
  title,
  action,
  children,
}: {
  title?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(true);

  if (!title) return <>{children}</>;

  return (
    <>
      <div className="sidenav-section-row">
        <button
          type="button"
          className="sidenav-section"
          aria-expanded={open}
          onClick={() => setOpen(o => !o)}
        >
          <span>{title}</span>
          <Caret />
        </button>
        {action}
      </div>
      {open && children}
    </>
  );
}

const NAV_LEAGUES_KEY = "nav:leagues";

export default function SideNav() {
  const pathname = usePathname() ?? "";
  const [leagues, setLeagues] = useState<League[]>(() => getCached<League[]>(NAV_LEAGUES_KEY) ?? []);

  const routeLeagueId = LEAGUE_ROUTE.exec(pathname)?.[1] ?? "";

  useEffect(() => {
    let live = true;
    const warm = readCached<League[]>(NAV_LEAGUES_KEY);
    if (warm) setLeagues(warm);
    api("/memberships", undefined, { gate: !warm }).then((ms: MyMembership[]) => {
      if (!live) return;
      const next: League[] = ms.map((m) => ({
          id: m.leagueId,
          // The league's own name, not your team's: this row IS the league.
          name: m.league?.name ?? "League",
          color: m.helmetColor ?? null,
      }));
      setCached(NAV_LEAGUES_KEY, next);
      setLeagues(next);
    })
      .catch(() => { /* leave the list empty; /home carries the real error UI */ });
    return () => { live = false; };
  }, [routeLeagueId]);

  const isOn = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  return (
    <nav className="app-sidebar" aria-label="Main">
      <div className="sidenav-head">
        <Link href="/home" className="sidenav-brand" aria-label="Wagerwolf home">
          <LogoWordmark height={LOCKUP_H} bare />
        </Link>
        <AccountMenu
          placement="down"
          className="sidenav-avatar"
          panelClassName="is-shell"
          panelGap={SHELL_MENU_GAP}
          icon={<UserIcon size={AVATAR_ICON} />}
        />
      </div>

      <Section>
        <Label href="/home" icon={<HomeIcon />} name="Home" active={isOn("/home")} />
      </Section>

      <Section title="Leagues" action={<LeaguesMenu />}>
        {leagues.map((l) => (
          <Label
            key={l.id}
            href={`/leagues/${l.id}`}
            name={l.name}
            active={routeLeagueId === l.id}
            icon={<LeagueShield color={l.color ?? "var(--surface-4)"} />}
          />
        ))}
      </Section>

      <Section title="Games">
        <SideNavGames />
      </Section>

      <div className="sidenav-foot">
        <HelpMenu />
      </div>
    </nav>
  );
}
