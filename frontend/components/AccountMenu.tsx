"use client";

import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { signOut } from "@/lib/auth";

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
 * has no icon column to put it in. It is the only mark this control draws; the
 * panel below is type alone.
 *
 * In the sidebar the label is hidden entirely (`.sidenav-avatar > span`), so the
 * trigger is that icon and nothing else and the panel is the only place the name
 * appears. In a bar the trigger is the name and the panel repeats it, which is
 * the cost of one component serving two shapes — and cheaper than a second
 * component that drifts.
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

// ── Cached identity ─────────────────────────────────────────────────────────
// The name comes from /users/me — so on a fresh load this control had nothing to
// show until a network round trip finished, and sat on its "My account" fallback
// for the whole of it. That is the flash this removes.
//
// Two layers, the same shape SideNav's hide-odds preference and GamesStrip's
// use:
//
//   cachedIdentity — module-level, so navigating between routes never re-flashes
//     even before the effect runs.
//   localStorage   — survives a reload, which the module variable does not.
//
// NEVER READ IN A useState INITIALIZER: that runs during SSR, where there is no
// localStorage, and the server and client would render different text —
// a hydration mismatch. The initializer takes the module variable, which is
// identical on both sides, and the stored value arrives from the effect.
//
// So one frame of the fallback survives a hard reload; what is gone is the
// hundreds of milliseconds of it that the fetch used to cost.
//
// NOT CLEARED HERE ON SIGN OUT, because it does not need to be: lib/auth's
// signOut() calls localStorage.clear(), which takes this with everything else.
// That is what stops the next person to sign in on this device seeing the last
// one's name.
const IDENTITY_KEY = "account_identity";

// The email used to live here too, back when the panel showed it. Entries
// written by that build still parse: the extra key is simply ignored.
type Identity = { name: string };

const NO_IDENTITY: Identity = { name: "" };

let cachedIdentity: Identity = NO_IDENTITY;

function readStoredIdentity(): Identity {
  if (typeof window === "undefined") return cachedIdentity;
  try {
    const raw = localStorage.getItem(IDENTITY_KEY);
    if (!raw) return NO_IDENTITY;
    const v = JSON.parse(raw);
    // Anything unexpected — an older build's format, a truncated write — falls
    // back to knowing nothing, which is a flash rather than wrong text.
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
    // Private mode or a full quota. The module variable already took it, so it
    // still holds for this session — it just won't outlive it.
  }
}

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
  // The one fact this control shows, in both of its forms: the bar renders it
  // as the trigger's label, the sidebar renders it in the panel.
  const [fullName, setFullName] = useState(cachedIdentity.name);
  const menuRef = useRef<HTMLDivElement>(null);

  // The caller only mounts this once it knows someone is signed in, so there is
  // no auth check here and no `authed` dependency — mounting IS the signal.
  useEffect(() => {
    // The stored copy first, so the row is right from the frame after mount
    // rather than after the round trip. Only applied when it holds something —
    // an empty cache must not blank a name the module variable already had.
    const stored = readStoredIdentity();
    if (stored.name) {
      cachedIdentity = stored;
      setFullName(stored.name);
    }

    api("/users/me").then((u: any) => {
      // Falls back to the display name for accounts where Google supplied no
      // given/family name, so they have no first/last on record.
      const full = [u.firstName, u.lastName].filter(Boolean).join(" ");
      const next = { name: full || u.displayName || u.name || "" };
      // The server is the authority; the cache is only ever a head start, so
      // this overwrites whatever was shown and re-stores it for next time.
      writeIdentity(next);
      setFullName(next.name);
    }).catch(() => {
      // Offline or a dead backend. Whatever the cache gave us stays on screen,
      // which is the last true answer rather than a fallback.
    });
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
        {/* THE PERSON'S NAME, not "My account". A row that names you is a row you
            recognise as yours, and the label was the last generic string in a
            column otherwise made of your leagues.

            "My account" survives as the fallback, and is what shows for the
            moment before /users/me lands and for an account Google supplied no
            name for. A blank row would be worse than a generic one.

            NO TRAILING ARROW. It carried over from the utility bar, where this
            control sat opposite "Play now ↗" and the pair read as one voice.
            The mark says "this goes somewhere", and this one does not — it
            opens a menu in place.

            In a span even without an icon: .sidenav-item's ellipsis rule is
            `> span`, and a bare text node has no box to truncate — which now
            matters, because a real name is far likelier to need truncating than
            two fixed words were. */}
        <span>{fullName || "My account"}</span>
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
          {/* THE NAME, AND NOTHING ELSE — no icon, no email.

              This has followed the trigger twice. While the trigger was the
              word "My account" the panel showed an icon and the name; when the
              trigger became the name itself the panel switched to the email, so
              as not to repeat the row you had just clicked. The trigger is an
              icon in the sidebar's head now and says nothing at all, so the
              name comes back here — it is the one thing a person opening this
              wants confirmed, and nothing else on screen carries it. */}
          <div className="navmenu-profile is-label">
            <span>{fullName || "—"}</span>
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
