"use client";

import type { CSSProperties } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import LogoWordmark from "@/components/LogoWordmark";

/**
 * The header for pages that carry no app chrome: the lockup top-left, and a
 * Done button hard against the right edge.
 *
 * /signup, /settings and the three legal pages are all "bare" — AppChrome and
 * SiteFooter are both suppressed on them, so they have no utility bar to go
 * back through. This is what replaces it. One component rather than a header
 * per page, so the lockup lands on the same pixel on all five.
 *
 * WHY THE GAPS ARE NOT THE PADDING
 *
 * The lockup's ink does not start at its box's top-left corner, so equal
 * padding would NOT produce equal visual margins:
 *
 *   top   the box reserves the face's full ascent (0.900em) while the tallest
 *         ink reaches only cap height (0.770em), and LOCKUP_INK_SHIFT_EM then
 *         drops the whole lockup 0.065em.
 *   left  the arrangement is mark-right, so the leftmost thing is the "w" of
 *         "wagerwolf", whose left side bearing is -0.005em — the glyph very
 *         slightly OVERHANGS its box, hence the negative.
 *
 * Both are subtracted below so EDGE_GAP_* mean what they say: the distance from
 * the screen edge to the ink you actually see.
 *
 * Derived from Arca Majora's nominal metrics, not measured in a browser. Same
 * caveat as LOCKUP_INK_SHIFT_EM in LogoWordmark.
 */

/** Lockup height. Everything in it — type, mark, gap, shift — is a fraction. */
const LOCKUP_H = 31.5;

/** Ink-to-edge distances. Left is 1.25x top, deliberately. */
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
  /**
   * ALIGN THE LOCKUP WITH A CENTRED COLUMN — ON A PHONE ONLY.
   *
   * EDGE_GAP_LEFT is right for a page whose content starts at the edge too —
   * the legal documents, /settings — and it is right for /sign-in and /signup
   * at desktop widths, where the mark sitting in the screen's corner above a
   * centred column is the composition.
   *
   * It stops being right on a phone. There the column has collapsed onto its
   * own 20px gutter and fills the screen, so a lockup at 47px is the only
   * thing on the page not on the left edge everything else shares — it reads
   * as floating loose above the form rather than heading it.
   *
   * Given the column's width, the header reproduces the centring arithmetic
   * exactly: `max(gutter, (100% - columnWidth) / 2)` is what a centred
   * `max-width` column inside `padding: 0 gutter` resolves to at every width,
   * which on a phone is the gutter. The `100%` is safe here — the header is a
   * full-width child of `.bare-route`, so its containing block IS the window.
   * (--rail carries a long note about the same expression breaking when it is
   * read from a nested element.)
   *
   * WHICH WIDTH IT APPLIES AT IS THE STYLESHEET'S CALL, not this component's.
   * Both distances are handed down as custom properties and `.bare-head` picks
   * between them, because a media query cannot reach an inline style — and an
   * inline custom property cannot be overridden by a rule either, so the
   * choosing has to happen on a property the sheet owns.
   */
  columnWidth?: number;
  /** The column's own side padding, and the floor the centring clamps to.
   *  AuthScreen's <main> uses 20. Ignored unless columnWidth is given. */
  columnGutter?: number;
}) {
  const router = useRouter();

  // Both minus the ink inset, so it is the INK that lands on the edge or on
  // the column rather than the lockup's box.
  const edgePad = `${EDGE_GAP_LEFT - INK_INSET_LEFT}px`;
  const columnPad =
    columnWidth === undefined
      ? undefined
      : `calc(max(${columnGutter}px, (100% - ${columnWidth}px) / 2) - ${INK_INSET_LEFT}px)`;

  return (
    // Flex, not a block with an inline-flex child: as an inline element the
    // lockup sat on the header's own line-box baseline, which added leading
    // above it that no padding here could account for and made the top gap
    // depend on the header's font rather than the lockup's.
    <header
      // The horizontal padding is in globals.css (.bare-head) and reads these
      // two values; only the vertical is set here. See the columnWidth note.
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
      {/* Links to `/` rather than /home: a visitor reading the terms may have no
          account, and someone signed in still gets somewhere sensible. */}
      <Link
        href="/"
        aria-label="Wagerwolf home"
        style={{ display: "inline-flex", alignItems: "center", color: "var(--text)" }}
      >
        <LogoWordmark height={LOCKUP_H} bare />
      </Link>

      {/* router.back(), not a fixed route: these pages are reached from several
          places — the footer, the account menu, a link in the copy — and Done
          means "return me to where I was", which only history knows. */}
      {done && (
        <button type="button" className="bare-done" onClick={() => router.back()}>
          Done
        </button>
      )}
    </header>
  );
}
