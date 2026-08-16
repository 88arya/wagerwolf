"use client";

import { useEffect, useState } from "react";

/**
 * Device-pixel snapping for thin rules — tab underlines, dividers, hairlines.
 *
 * A thin line whose thickness is a plain CSS px value lands on a fractional
 * number of device pixels at any non-integer devicePixelRatio (1.25, 1.3, 1.5,
 * common on Windows display scaling). The browser then paints one solid device
 * row plus a partial, reduced-opacity one, and the line reads as half-drawn.
 * The bet page solves the same problem for its odds-box gutter via --box-gap.
 *
 * Draw the rule as a filled element rather than an `inset` box-shadow. Chrome
 * rasterises an inset shadow as the difference between the padding-box rect and
 * that rect offset by the shadow's offset; under fractional scaling the two
 * rects round to different columns and the leftover mismatch leaks a faint 1px
 * seam up the element's edge.
 */
export function useDevicePixelRatio() {
  // Starts at 1 so the server render and the first client render agree, then
  // corrects on mount.
  const [dpr, setDpr] = useState(1);

  useEffect(() => {
    const update = () => setDpr(window.devicePixelRatio || 1);
    update();
    // devicePixelRatio changes on zoom and on moving between monitors; the
    // resolution media query fires for both, but must be re-armed each time
    // because it is pinned to the current ratio.
    const mq = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
    mq.addEventListener("change", update);
    window.addEventListener("resize", update);
    return () => {
      mq.removeEventListener("change", update);
      window.removeEventListener("resize", update);
    };
  }, [dpr]);

  return dpr;
}

/**
 * Rounds an intended CSS-px thickness to the nearest whole number of device
 * pixels, never going below one. Keeps the rule visually the weight the design
 * asks for while guaranteeing it rasterises crisply.
 */
export function snapToDevicePx(cssPx: number, dpr: number) {
  return Math.max(1, Math.round(cssPx * dpr)) / dpr;
}
