"use client";

import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import MenuPanel from "@/components/MenuPanel";
import { signOut } from "@/lib/auth";
import type { Me } from "@/lib/types";

type Placement = "down" | "up";

const IDENTITY_KEY = "account_identity";

type Identity = { name: string };

const NO_IDENTITY: Identity = { name: "" };

let cachedIdentity: Identity = NO_IDENTITY;

function readStoredIdentity(): Identity {
  if (typeof window === "undefined") return cachedIdentity;
  try {
    const raw = localStorage.getItem(IDENTITY_KEY);
    if (!raw) return NO_IDENTITY;
    const v = JSON.parse(raw);
    return typeof v?.name === "string" ? { name: v.name } : NO_IDENTITY;
  } catch {
    return NO_IDENTITY;
  }
}

function writeIdentity(v: Identity) {
  cachedIdentity = v;
  try {
    localStorage.setItem(IDENTITY_KEY, JSON.stringify(v));
  } catch {
  }
}

export default function AccountMenu({
  style,
  placement = "down",
  className = "utility-link",
  panelClassName = "",
  panelGap,
  icon,
}: {
  style?: CSSProperties;
  placement?: Placement;
  className?: string;
  panelClassName?: string;
  panelGap?: number;
  icon?: React.ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [fullName, setFullName] = useState(cachedIdentity.name);
  // Anchors the portaled panel; see components/MenuPanel.
  const btnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const stored = readStoredIdentity();
    if (stored.name) {
      cachedIdentity = stored;
      setFullName(stored.name);
    }

    // Not held behind the boot gate when a stored name is already showing.
    api("/users/me", undefined, { gate: !stored.name }).then((u: Me) => {
      const full = [u.firstName, u.lastName].filter(Boolean).join(" ");
      const next = { name: full || u.displayName || "" };
      writeIdentity(next);
      setFullName(next.name);
    }).catch(() => {
    });
  }, []);

  function logout() {
    signOut();
    setOpen(false);
    router.push("/");
  }

  return (
    <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
      <button
        ref={btnRef}
        type="button"
        className={className}
        style={style}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(o => !o)}
      >
        {icon}
        <span>{fullName || "My account"}</span>
      </button>

      {open && (
        <MenuPanel
          anchorRef={btnRef}
          placement={placement}
          onClose={() => setOpen(false)}
          className={`utility-menu ${panelClassName} ${placement === "up" ? "is-up" : "is-down"}`}
          gap={panelGap}
          style={{
            border: "1px solid var(--border)",
            boxShadow: "none",
            zIndex: 500,
            padding: "6px 0",
          }}
        >
          <div className="navmenu-profile is-label">
            <span>{fullName || "—"}</span>
          </div>
          <div style={{ borderTop: "1px solid var(--border)", margin: "3px 17px" }} />
          <button type="button" className="navmenu-profile" onClick={() => { router.push("/settings"); setOpen(false); }}>
            <span>Account settings</span>
          </button>
          <button type="button" className="navmenu-profile" onClick={logout}>
            <span>Sign out</span>
          </button>
        </MenuPanel>
      )}
    </div>
  );
}
