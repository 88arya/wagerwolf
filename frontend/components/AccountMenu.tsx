"use client";

import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { signOut } from "@/lib/auth";
import UserIcon from "@/components/UserIcon";

/**
 * "My account" plus its dropdown — the global account control, extracted from
 * TopBar so the landing nav can carry the same one.
 *
 * TWO BARS, ONE CONTROL. Signed in on `/` there is no utility bar any more (see
 * AppChrome), so the nav below it holds the account link in the slot "Sign in"
 * and "Get started" occupy for a visitor. Everywhere else the utility bar still
 * holds it. Duplicating the trigger, the fetch, the outside-click handler and
 * the menu rows across the two would be four things to keep in step; this is
 * one.
 *
 * TWO TRIGGERS, ONE MENU. `className` decides which, because the two surfaces
 * want opposite things from a control:
 *
 *  - `.utility-link` (the default, and SiteNav's) — chrome stripped back to
 *    plain type with the hover underline that sweeps in from the left. Right in
 *    a bar, where the control is a word at the end of a row.
 *  - `.sidenav-item` — the sidebar's label: a fixed-height row with an icon
 *    column and a filled hover. Right in the sidebar, where "My account" is one
 *    row among Home, Friends and a list of leagues and has no business being
 *    the only thing in the column drawn differently.
 *
 * Both classes strip the global `button` rule, which is a filled accent pill
 * and would otherwise repaint this as a card either way.
 *
 * `icon` is the mark beside the label, and only the sidebar passes one — a bar
 * has no icon column to put it in. It is also what the menu's own name row
 * uses, so the trigger and the panel it opens cannot show two different marks
 * for the same person.
 *
 * `style` is the type only — face, size, weight, colour — and the bar is the
 * only caller that needs it. The underline is `currentColor`, so it follows
 * whatever colour is passed.
 */

/**
 * Which side of the trigger the panel hangs off.
 *
 * "down" is the bar case — SiteNav, where there is a whole page below. "up" is
 * the sidebar case, where this is the last thing in the column and a panel
 * below the trigger would open past the bottom of the window.
 *
 * Two anchored edges rather than a measured flip: both call sites know which
 * way they face and neither moves, so watching the viewport for it would be
 * machinery in place of a prop.
 */
type Placement = "down" | "up";

export default function AccountMenu({
  style,
  placement = "down",
  className = "utility-link",
  icon,
}: {
  style?: CSSProperties;
  placement?: Placement;
  className?: string;
  icon?: React.ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [fullName, setFullName] = useState("");
  const menuRef = useRef<HTMLDivElement>(null);

  // The caller only mounts this once it knows someone is signed in, so there is
  // no auth check here and no `authed` dependency — mounting IS the signal.
  useEffect(() => {
    api("/users/me").then((u: any) => {
      // Falls back to the display name for accounts where Google supplied no
      // given/family name, so they have no first/last on record.
      const full = [u.firstName, u.lastName].filter(Boolean).join(" ");
      setFullName(full || u.displayName || u.name || "");
    }).catch(() => {});
  }, []);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  function logout() {
    signOut();
    setOpen(false);
    router.push("/");
  }

  return (
    // Its own positioned wrapper, so the panel hangs off the trigger wherever
    // this is mounted rather than off whatever box the host happened to give
    // it. TopBar's right-hand slot is `position: relative` too — nesting is
    // fine, and it means the panel's `right: 0` is the trigger's right edge in
    // both bars.
    <div ref={menuRef} style={{ position: "relative", display: "flex", alignItems: "center" }}>
      <button
        type="button"
        className={className}
        style={style}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(o => !o)}
      >
        {icon}
        {/* NO TRAILING ARROW. It carried over from the utility bar, where this
            control sat opposite "Play now ↗" and the pair read as one voice.
            The mark says "this goes somewhere", and this one does not — it
            opens a menu in place.

            In a span even without an icon: .sidenav-item's ellipsis rule is
            `> span`, and a bare text node has no box to truncate. */}
        <span>My account</span>
      </button>

      {open && (
        // Same panel treatment as LeagueNav's menus: square, no border, shadow
        // only, 6px of vertical padding. Name is a label row, then a rule, then
        // the actions.
        // WHICH EDGE IT HANGS OFF IS A CLASS, NOT AN INLINE STYLE, and that is
        // load bearing: the sidebar turns into a horizontal strip across the
        // TOP of the page on a narrow screen, where "up" would open the panel
        // off the top of the window. A media query has to be able to flip it
        // back, and it cannot out-specify an inline style. See .utility-menu
        // in globals.css.
        <div
          className={`utility-menu ${placement === "up" ? "is-up" : "is-down"}`}
          style={{
            background: "var(--surface)",
            border: "none",
            borderRadius: 0,
            boxShadow: "var(--shadow-md)",
            zIndex: 500,
            padding: "6px 0",
          }}
        >
          <div className="navmenu-profile is-label">
            <span style={{ gap: 8 }}>
              {/* The same mark as the trigger, at the row's own size. Showing a
                  different person icon in the panel than on the control that
                  opened it is how this drifted before. */}
              <UserIcon size={15} />
              {fullName || "—"}
            </span>
          </div>
          {/* Inset to line up with the rows' inner rectangle rather than
              running the full width of the panel: 8px of row padding plus
              9px inside the rectangle. */}
          <div style={{ borderTop: "1px solid var(--border)", margin: "3px 17px" }} />
          <button type="button" className="navmenu-profile" onClick={() => { router.push("/settings"); setOpen(false); }}>
            <span>Account Settings</span>
          </button>
          <button type="button" className="navmenu-profile" onClick={logout}>
            <span>Sign Out</span>
          </button>
        </div>
      )}
    </div>
  );
}
