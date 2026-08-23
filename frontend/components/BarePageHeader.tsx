"use client";

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

export default function BarePageHeader({ done = false }: { done?: boolean }) {
  const router = useRouter();

  return (
    // Flex, not a block with an inline-flex child: as an inline element the
    // lockup sat on the header's own line-box baseline, which added leading
    // above it that no padding here could account for and made the top gap
    // depend on the header's font rather than the lockup's.
    <header
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: `${EDGE_GAP_TOP - INK_INSET_TOP}px ${EDGE_GAP_LEFT - INK_INSET_LEFT}px`,
      }}
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
