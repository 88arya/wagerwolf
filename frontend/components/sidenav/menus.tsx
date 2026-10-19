"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Globe, MoreHorizontal, Plus } from "lucide-react";
import LeagueActions, { type LeagueAction } from "@/components/LeagueActions";
import MenuPanel from "@/components/MenuPanel";
import SupportModal from "@/components/SupportModal";
import { DocsIcon, HelpIcon, LockIcon, MailIcon, SettingsIcon, type MenuIcon } from "./icons";

export const SHELL_MENU_GAP = 0;

/** The three ways into a league, and the only thing "More" opens. */
const MORE_ACTIONS: Array<{ action: LeagueAction; name: string; icon: MenuIcon }> = [
  { action: "public",  name: "Join public league",  icon: Globe },
  { action: "private", name: "Join private league", icon: LockIcon },
  { action: "create",  name: "Create a league",     icon: Plus },
];

type MenuItem = {
  key: string;
  name: string;
  icon?: MenuIcon;
  onSelect: () => void;
};

function DotsMenu({
  label,
  items,
  trigger = <MoreHorizontal size={15} strokeWidth={1.75} />,
  triggerClass = "sidenav-more",
  placement = "down",
}: {
  label: string;
  items: MenuItem[];
  trigger?: React.ReactNode;
  triggerClass?: string;
  placement?: "up" | "down";
}) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);

  return (
    <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
      <button
        ref={btnRef}
        type="button"
        className={triggerClass}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        onClick={() => setOpen(o => !o)}
      >
        {trigger}
      </button>

      {open && (
        <MenuPanel
          anchorRef={btnRef}
          placement={placement}
          onClose={() => setOpen(false)}
          className={`utility-menu is-shell is-${placement}`}
          gap={SHELL_MENU_GAP}
          role="menu"
          style={{
            border: "1px solid var(--border)",
            boxShadow: "none",
            zIndex: 500,
            padding: "6px 0",
          }}
        >
          {items.map(({ key, name, icon: Icon, onSelect }) => (
            <button
              key={key}
              type="button"
              role="menuitem"
              className="navmenu-profile"
              onClick={() => { onSelect(); setOpen(false); }}
            >
              <span style={{ gap: 8 }}>
                {Icon && <Icon size={14} strokeWidth={1.75} style={{ flexShrink: 0 }} />}
                {name}
              </span>
            </button>
          ))}
        </MenuPanel>
      )}
    </div>
  );
}

export function LeaguesMenu() {
  const [action, setAction] = useState<LeagueAction | null>(null);

  return (
    <>
      <DotsMenu
        label="Add a league"
        items={MORE_ACTIONS.map(a => ({
          key: a.action,
          name: a.name,
          icon: a.icon,
          onSelect: () => setAction(a.action),
        }))}
      />
      <LeagueActions action={action} onClose={() => setAction(null)} />
    </>
  );
}

export function HelpMenu() {
  const router = useRouter();
  const [support, setSupport] = useState(false);
  return (
    <>
    <DotsMenu
      label="Help and documents"
      placement="up"
      triggerClass="sidenav-help"
      trigger={<HelpIcon />}
      items={[
        { key: "settings", name: "Account settings", icon: SettingsIcon, onSelect: () => router.push("/settings") },
        { key: "docs", name: "Docs", icon: DocsIcon, onSelect: () => window.open("/docs", "_blank", "noopener,noreferrer") },
        { key: "contact", name: "Contact us", icon: MailIcon, onSelect: () => setSupport(true) },
      ]}
    />
    {support && <SupportModal onClose={() => setSupport(false)} />}
    </>
  );
}
