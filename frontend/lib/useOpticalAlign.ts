"use client";

import { useEffect } from "react";

/**
 * Measures the games strip's four vertical text offsets and publishes them as
 * CSS variables on <html>.
 *
 * WHY THIS IS MEASURED AT RUNTIME AND NOT A CONSTANT
 *
 * These offsets used to be hardcoded decimals (-0.385, -0.769, 0.385), obtained
 * by reading rendered positions out of the DOM on one machine. Every one of them
 * turned out to be a whole or half DEVICE pixel divided by that machine's 1.3
 * dpr — the display's rounding, recorded as if it were font geometry. That is
 * why alignment here kept looking right at one zoom and a pixel out at the next,
 * and why re-tuning the numbers never made the problem stay fixed.
 *
 * The reason no constant can work: Chrome rounds a font's ascent and descent to
 * whole device pixels INDEPENDENTLY, and they can round in opposite directions.
 * Fugaz One at 12px has a true ascent of 12.5538 (16.32 device px at 1.3x, which
 * rounds DOWN to 16) and a true descent of 5.0615 (6.58, which rounds UP to 7).
 * The half-leading therefore does not absorb the error the way it would if both
 * rounded together, and the baseline lands 0.285px off its true position — on
 * top of a real 0.566px geometric error. Browser zoom changes the device pixel,
 * so it changes that penalty. Measured across sizes at 1.3x, the correction the
 * abbreviation actually needs ranges from 0.013em to 0.071em with no pattern:
 *
 *     10px -> 0.0132em    12px -> 0.0709em    14px -> 0.0576em
 *     11px -> 0.0447em    13px -> 0.0344em    18px -> 0.0606em
 *
 * A single em value would have to be all of those at once. So we measure the
 * real thing at the real size, and measure it again whenever the zoom changes.
 *
 * WHAT EACH VARIABLE IS
 *
 *   --strip-abbr-shift    drops the team abbreviation's CAP centre onto the
 *                         logo's centre. The eye reads the middle of all-caps
 *                         text, not the middle of its line box, and Fugaz One
 *                         is not symmetric about that.
 *   --strip-odds-shift    the odds, kept on the abbreviation's baseline. Carries
 *                         the abbreviation's own shift, so the pair moves as one.
 *   --strip-score-shift   same, for the live/final score that replaces the odds.
 *   --strip-value-shift   the matchup row's value, kept on its name's baseline.
 *                         No Fugaz One and no logo there, so it stands alone.
 *
 * The fallbacks written into the call sites are the pure-geometry values, which
 * is what a device with no rounding error would need. They are what paints
 * before this runs — never badly wrong, just not exact.
 *
 * Effect-only, never a useState initializer: this touches layout and would
 * mismatch on hydration if it ran during SSR.
 */

const VARS = {
  abbr: "--strip-abbr-shift",
  odds: "--strip-odds-shift",
  score: "--strip-score-shift",
  value: "--strip-value-shift",
} as const;

/** Font sizes the strip uses, in rem, so a changed root size is followed. */
const REM = { abbr: 0.75, odds: 0.625, score: 0.75, name: 0.75, value: 0.7 };

// Must stay identical to GamesStrip's TEAM_ABBR — this measures the face that
// actually paints, so a mismatch here silently measures the wrong thing.
const ABBR_FAMILY = "var(--font-lemon-milk), system-ui, sans-serif";
const ABBR_WEIGHT = "700";

/** A zero-sized inline-block sitting on the baseline: its top IS the baseline. */
function baselineOf(host: HTMLElement): number {
  const p = document.createElement("span");
  p.style.cssText =
    "display:inline-block;width:0;height:0;vertical-align:baseline";
  host.appendChild(p);
  const top = p.getBoundingClientRect().top;
  p.remove();
  return top;
}

function span(
  text: string,
  size: number,
  weight: string,
  opts: { family?: string; style?: string; letterSpacing?: string } = {},
): HTMLSpanElement {
  const s = document.createElement("span");
  // Set through .style rather than a style="" string: the font stacks contain
  // double quotes, which silently terminate a style attribute and drop every
  // declaration after them.
  if (opts.family) s.style.fontFamily = opts.family;
  if (opts.style) s.style.fontStyle = opts.style;
  if (opts.letterSpacing) s.style.letterSpacing = opts.letterSpacing;
  s.style.fontWeight = weight;
  s.style.fontSize = `${size}px`;
  s.textContent = text;
  return s;
}

function row(children: HTMLElement[]): HTMLDivElement {
  const d = document.createElement("div");
  d.style.display = "flex";
  d.style.alignItems = "center";
  d.append(...children);
  return d;
}

function box(size: number): HTMLDivElement {
  const d = document.createElement("div");
  d.style.width = `${size}px`;
  d.style.height = `${size}px`;
  d.style.flexShrink = "0";
  return d;
}

/**
 * Cap height of the abbreviation face, as a fraction of font size.
 *
 * Taken from canvas actualBoundingBoxAscent, which reports real glyph INK and
 * is the one metric here that is not subject to line-box rounding. Measured at
 * 2000px so the integer quantisation lands four decimal places away.
 */
function capHeightRatio(resolvedFamily: string): number {
  const ctx = document.createElement("canvas").getContext("2d");
  if (!ctx) return 0;
  const SIZE = 2000;
  // ABBR_WEIGHT, not a hardcoded 400: cap height is usually stable across a
  // family's weights but is not guaranteed to be, and measuring a cut that is
  // not the one painting is the exact class of error this file exists to avoid.
  ctx.font = `${ABBR_WEIGHT} ${SIZE}px ${resolvedFamily}`;
  if (!ctx.font.includes(String(SIZE))) return 0; // stack was rejected
  return ctx.measureText("NE").actualBoundingBoxAscent / SIZE;
}

/** First family in a resolved font stack, quotes intact so it can be re-used. */
function primaryFamily(stack: string): string {
  return stack.split(",")[0]?.trim() ?? "";
}

/**
 * Whether the face we are about to measure is the one that will actually paint.
 *
 * This guard is the difference between a correct offset and a confidently wrong
 * one. next/font ships a metric-adjusted local stand-in ("Fugaz One Fallback")
 * that has a VERY different cap height — 0.809 of font size against the real
 * face's 0.719. Measure during the swap and you get a shift of 1.39px instead
 * of 0.85px, and the abbreviation sits half a pixel BELOW centre rather than
 * above it: the bug moves rather than goes away, which is worse than not
 * running at all. document.fonts.ready is not sufficient on its own — it can
 * settle before this particular face is usable — so check the face itself.
 */
function faceReady(stack: string, size: number): boolean {
  const primary = primaryFamily(stack);
  if (!primary) return false;
  try {
    // The weight that actually paints — a family can have 400 loaded and 700
    // still in flight, and measuring mid-swap is what this guard prevents.
    return document.fonts.check(`${ABBR_WEIGHT} ${size}px ${primary}`);
  } catch {
    return false; // malformed shorthand — treat as not ready rather than throw
  }
}

function measure(): Record<keyof typeof VARS, number> | null {
  const root = document.documentElement;
  const rem = parseFloat(getComputedStyle(root).fontSize) || 16;
  const px = (r: number) => r * rem;

  const stage = document.createElement("div");
  stage.style.cssText =
    "position:fixed;left:-99999px;top:0;visibility:hidden;pointer-events:none";

  // Row 1 mirrors a game card: 24px logo, then the three text pieces that sit
  // beside it. Sizes and faces must match the real card or the measurement is
  // of something else.
  const logo = box(24);
  const abbr = span("NE", px(REM.abbr), ABBR_WEIGHT, {
    family: ABBR_FAMILY,
    letterSpacing: "0.04em",
  });
  const odds = span("+162", px(REM.odds), "700", { letterSpacing: "0.04em" });
  const score = span("24", px(REM.score), "700");

  // Row 2 mirrors the matchup card: a 20px helmet, a name, and a value. Both
  // are Inter Tight, so this pair only needs its baselines reconciled.
  const name = span("TEAM", px(REM.name), "700");
  const value = span("1234", px(REM.value), "550");

  stage.append(row([logo, abbr, odds, score]), row([box(20), name, value]));
  document.body.appendChild(stage);

  try {
    const stack = getComputedStyle(abbr).fontFamily;
    if (!faceReady(stack, px(REM.abbr))) return null; // caller retries
    const capRatio = capHeightRatio(stack);
    if (!capRatio) return null;

    const lr = logo.getBoundingClientRect();
    const logoMid = (lr.top + lr.bottom) / 2;
    const capHalf = (capRatio * px(REM.abbr)) / 2;

    const bAbbr = baselineOf(abbr);
    const bOdds = baselineOf(odds);
    const bScore = baselineOf(score);
    const bName = baselineOf(name);
    const bValue = baselineOf(value);

    // Drop the cap centre onto the logo centre; the two numbers beside it then
    // ride along so they stay on the abbreviation's baseline.
    const abbrShift = logoMid - (bAbbr - capHalf);
    return {
      abbr: abbrShift,
      odds: abbrShift + (bAbbr - bOdds),
      score: abbrShift + (bAbbr - bScore),
      value: bName - bValue,
    };
  } finally {
    stage.remove();
  }
}

export function useOpticalAlign(): void {
  useEffect(() => {
    const root = document.documentElement;
    let frame = 0;
    let retry = 0;
    let dprQuery: MediaQueryList | null = null;
    let cancelled = false;

    // A measurement taken mid-swap describes the fallback face, so a refusal is
    // retried rather than dropped. Until one succeeds the call sites keep their
    // pure-geometry defaults, which are close; publishing fallback metrics
    // instead would push the abbreviation past centre the other way.
    const apply = (attempt = 0) => {
      if (cancelled) return;
      const m = measure();
      if (!m) {
        if (attempt < 40) {
          window.clearTimeout(retry);
          retry = window.setTimeout(() => apply(attempt + 1), 100);
        }
        return;
      }
      for (const key of Object.keys(VARS) as (keyof typeof VARS)[]) {
        // 4dp is well past what a device pixel can resolve at any sane dpr.
        root.style.setProperty(VARS[key], `${m[key].toFixed(4)}px`);
      }
    };

    // Zoom does not fire its own event. It does change devicePixelRatio, and a
    // resolution media query is the only thing that reports that directly —
    // `resize` catches the common case but not a zoom that leaves the viewport
    // size unchanged. The query has to be rebuilt after every change, since it
    // is pinned to the dpr that was current when it was created.
    const watchDpr = () => {
      dprQuery?.removeEventListener("change", onDpr);
      dprQuery = window.matchMedia(
        `(resolution: ${window.devicePixelRatio}dppx)`,
      );
      dprQuery.addEventListener("change", onDpr);
    };
    function onDpr() {
      schedule();
      watchDpr();
    }

    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => apply());
    };

    // Metrics are meaningless until the real faces are in — before that the
    // measurement describes the fallback.
    document.fonts.ready.then(() => {
      if (!cancelled) apply();
    });
    schedule();
    watchDpr();
    window.addEventListener("resize", schedule);

    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      window.clearTimeout(retry);
      window.removeEventListener("resize", schedule);
      dprQuery?.removeEventListener("change", onDpr);
    };
  }, []);
}
