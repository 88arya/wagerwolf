"use client";

import type { CSSProperties } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import LogoWordmark from "@/components/LogoWordmark";

/** Lockup height. Everything in it - type, mark, gap, shift - is a fraction. */
const LOCKUP_H = 31.5;

const EDGE_GAP_TOP = 37.5;
const EDGE_GAP_LEFT = 37.5 * 1.25;

/** How far the ink sits inside its own box, at this lockup height. */
const INK_INSET_TOP = 4.3 * (LOCKUP_H / 31.5);
const INK_INSET_LEFT = -0.11 * (LOCKUP_H / 31.5);

export default function BarePageHeader({
  done = false,
  columnWidth,
  columnGutter = 20,
}: {
  done?: boolean;
  columnWidth?: number;
  columnGutter?: number;
}) {
  const router = useRouter();

  const edgePad = `${EDGE_GAP_LEFT - INK_INSET_LEFT}px`;
  const columnPad =
    columnWidth === undefined
      ? undefined
      : `calc(max(${columnGutter}px, (100% - ${columnWidth}px) / 2) - ${INK_INSET_LEFT}px)`;

  return (
    <header
      className={`bare-head${columnPad ? " is-column" : ""}`}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        paddingTop: EDGE_GAP_TOP - INK_INSET_TOP,
        paddingBottom: EDGE_GAP_TOP - INK_INSET_TOP,
        "--bare-pad-edge": edgePad,
        ...(columnPad ? { "--bare-pad-col": columnPad } : {}),
      } as CSSProperties}
    >
      <Link
        href="/"
        aria-label="Wagerwolf home"
        style={{ display: "inline-flex", alignItems: "center", color: "var(--text)" }}
      >
        <LogoWordmark height={LOCKUP_H} bare />
      </Link>

      {done && (
        <button type="button" className="bare-done" onClick={() => router.back()}>
          Done
        </button>
      )}
    </header>
  );
}
