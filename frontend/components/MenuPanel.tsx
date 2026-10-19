"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { CSSProperties, ReactNode, RefObject } from "react";

export type Placement = "up" | "down";

const STRIP_QUERY = "(max-width: 900px)";

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
  const [placed, setPlaced] = useState<{ pos: CSSProperties; dir: Placement } | null>(null);

  const place = useCallback(() => {
    const anchor = anchorRef.current;
    if (!anchor) return;
    const r = anchor.getBoundingClientRect();

    const dir: Placement = window.matchMedia(STRIP_QUERY).matches ? "down" : placement;

    const next: CSSProperties =
      dir === "down"
        ? { position: "fixed", top: r.bottom + gap, right: Math.max(GAP, window.innerWidth - r.right) }
        : { position: "fixed", bottom: window.innerHeight - r.top + gap, left: Math.max(GAP, r.left) };

    setPlaced({ pos: next, dir });
  }, [anchorRef, placement, gap]);

  useLayoutEffect(() => { place(); }, [place]);

  useEffect(() => {
    const onMove = () => place();
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
      if (anchorRef.current?.contains(t)) return;
      onClose();
    }
    document.addEventListener("mousedown", onDocDown);
    return () => document.removeEventListener("mousedown", onDocDown);
  }, [anchorRef, onClose]);

  // No document during SSR, and no position until the first layout pass.
  if (typeof document === "undefined" || !placed) return null;

  return createPortal(
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
