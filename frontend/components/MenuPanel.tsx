"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { CSSProperties, ReactNode, RefObject } from "react";

export type Placement = "up" | "down";

/**
 * A menu panel that is NOT clipped by whatever opened it.
 *
 * WHY THIS EXISTS. The sidebar's popups used to be `position: absolute` inside
 * the column. .app-sidebar is the scroll container, so it carries
 * `overflow-x: hidden`, and an absolutely positioned descendant is clipped by
 * that — which capped every panel at the column's 220px inner width. It went
 * unnoticed while the panels were 214px wide and became obvious the moment they
 * were widened. z-index cannot fix it: the panel was never behind anything, it
 * was cut off.
 *
 * So the panel is rendered into <body> through a portal and positioned
 * `fixed` against the trigger's measured rect. Nothing between it and the
 * document root can clip it, and it can overlap the content card the way a
 * dropdown is supposed to.
 *
 * WHAT THAT COST, since it is not free. Three things the old CSS did for
 * nothing now have to be done by hand:
 *
 *  - POSITION. `.utility-menu.is-down/.is-up` anchored one edge each way. The
 *    same two cases are computed here, and the anchored-edge trick is kept:
 *    "down" pins the panel's top under the trigger, "up" pins its bottom to the
 *    trigger's top, so the panel's own height never enters into it and it never
 *    needs measuring.
 *  - REPOSITION ON SCROLL. A fixed panel does not travel with an anchor that
 *    scrolls. The listener is capturing, so it hears the sidebar's own scroll
 *    and not just the window's.
 *  - THE NARROW-SCREEN FLIP. A media query used to turn `is-up` back down when
 *    the sidebar becomes a top strip, since a panel pinned to its trigger's
 *    head would open off the top of the window. Inline styles out-specify a
 *    media query, so that decision moves here.
 *
 * OUTSIDE-CLICK LIVES HERE TOO, and has to: the panel is no longer inside the
 * trigger's wrapper, so a wrapper-only check would treat every click on the
 * menu itself as a click outside it and close before the row fired.
 */
const STRIP_QUERY = "(max-width: 900px)";

/**
 * The DEFAULT gap between a panel and the control that opens it — what the old
 * `margin-top`/`margin-bottom: 6px` left between the two.
 *
 * A default rather than a fixed value because the sidebar's panels sit tighter
 * than this; see the `gap` prop, and SHELL_MENU_GAP in SideNav for the number
 * they pass. It cannot be done in CSS: the panel is `position: fixed` and this
 * is folded into the computed `top`/`bottom` below, not a margin.
 */
const GAP = 6;

export default function MenuPanel({
  anchorRef,
  placement,
  onClose,
  className,
  style,
  role,
  gap = GAP,
  children,
}: {
  anchorRef: RefObject<HTMLElement | null>;
  placement: Placement;
  onClose: () => void;
  className?: string;
  style?: CSSProperties;
  role?: string;
  /** Distance from the trigger, in px. See GAP above for why it is a prop. */
  gap?: number;
  children: ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  /**
   * Position AND the direction it was resolved to, in one piece of state.
   *
   * The direction has to come back out because `placement` is only what the
   * CALLER asked for: the narrow-screen flip below can turn "up" into "down",
   * and until this existed the panel carried the caller's `is-up` class while
   * actually hanging downward. Nothing depended on that being right — the class
   * only fed rules the inline position already out-specified — but an open
   * animation keyed on direction would slide the wrong way, which is exactly
   * the sort of thing nobody would think to check on a narrow window.
   */
  const [placed, setPlaced] = useState<{ pos: CSSProperties; dir: Placement } | null>(null);

  const place = useCallback(() => {
    const anchor = anchorRef.current;
    if (!anchor) return;
    const r = anchor.getBoundingClientRect();

    // A strip across the top of the page has no room above it, so "up" becomes
    // "down" there — the flip the media query used to make.
    const dir: Placement = window.matchMedia(STRIP_QUERY).matches ? "down" : placement;

    // Which edges are anchored mirrors the CSS this replaced: opening down
    // hangs off the trigger's right, opening up off its left. The two callers
    // face opposite ways — a bar's trigger is the last thing on the right, and
    // a left-anchored panel would run off the window; the sidebar's is a mark
    // in a 240px column, and a right-anchored one would have nowhere to go.
    const next: CSSProperties =
      dir === "down"
        ? { position: "fixed", top: r.bottom + gap, right: Math.max(GAP, window.innerWidth - r.right) }
        : { position: "fixed", bottom: window.innerHeight - r.top + gap, left: Math.max(GAP, r.left) };

    setPlaced({ pos: next, dir });
  }, [anchorRef, placement, gap]);

  // Layout, not effect: this runs before paint, so the panel is never shown at
  // a stale position for a frame.
  useLayoutEffect(() => { place(); }, [place]);

  useEffect(() => {
    const onMove = () => place();
    // Capture, so a scroll inside .app-sidebar reaches this and not only a
    // scroll of the window.
    window.addEventListener("scroll", onMove, true);
    window.addEventListener("resize", onMove);
    return () => {
      window.removeEventListener("scroll", onMove, true);
      window.removeEventListener("resize", onMove);
    };
  }, [place]);

  useEffect(() => {
    function onDocDown(e: MouseEvent) {
      const t = e.target as Node;
      if (panelRef.current?.contains(t)) return;
      // The trigger is excluded so its own onClick can do the toggling; without
      // this, mousedown would close the menu and the click would reopen it.
      if (anchorRef.current?.contains(t)) return;
      onClose();
    }
    document.addEventListener("mousedown", onDocDown);
    return () => document.removeEventListener("mousedown", onDocDown);
  }, [anchorRef, onClose]);

  // No document during SSR, and no position until the first layout pass.
  if (typeof document === "undefined" || !placed) return null;

  return createPortal(
    // `opens-up`/`opens-down` is the RESOLVED direction — see the state above.
    // Kept separate from the caller's own is-up/is-down rather than rewriting
    // them: those are the caller's to set, and the two genuinely disagree on a
    // narrow screen.
    <div
      ref={panelRef}
      className={[className, `opens-${placed.dir}`].filter(Boolean).join(" ")}
      role={role}
      style={{ ...style, ...placed.pos }}
    >
      {children}
    </div>,
    document.body,
  );
}
