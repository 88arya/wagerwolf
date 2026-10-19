"use client";

import { useEffect } from "react";

// Measures the games strip's text offsets at runtime (they depend on the loaded
// font and device pixel ratio) and publishes them as CSS variables.

const VARS = {
  abbr: "--strip-abbr-shift",
  odds: "--strip-odds-shift",
  score: "--strip-score-shift",
  value: "--strip-value-shift",
} as const;

/** Font sizes the strip uses, in rem, so a changed root size is followed. */
const REM = { abbr: 0.75, odds: 0.625, score: 0.75, name: 0.75, value: 0.7 };

const ABBR_FAMILY = "var(--font-fugaz-one), system-ui, sans-serif";
const ABBR_WEIGHT = "400";

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

function capHeightRatio(resolvedFamily: string): number {
  const ctx = document.createElement("canvas").getContext("2d");
  if (!ctx) return 0;
  const SIZE = 2000;
  ctx.font = `${ABBR_WEIGHT} ${SIZE}px ${resolvedFamily}`;
  if (!ctx.font.includes(String(SIZE))) return 0; // stack was rejected
  return ctx.measureText("NE").actualBoundingBoxAscent / SIZE;
}

/** First family in a resolved font stack, quotes intact so it can be re-used. */
function primaryFamily(stack: string): string {
  return stack.split(",")[0]?.trim() ?? "";
}

// Don't measure the next/font fallback face; its metrics differ.
function faceReady(stack: string, size: number): boolean {
  const primary = primaryFamily(stack);
  if (!primary) return false;
  try {
    return document.fonts.check(`${ABBR_WEIGHT} ${size}px ${primary}`);
  } catch {
    return false; // malformed shorthand - treat as not ready rather than throw
  }
}

function measure(): Record<keyof typeof VARS, number> | null {
  const root = document.documentElement;
  const rem = parseFloat(getComputedStyle(root).fontSize) || 16;
  const px = (r: number) => r * rem;

  const stage = document.createElement("div");
  stage.style.cssText =
    "position:fixed;left:-99999px;top:0;visibility:hidden;pointer-events:none";

  const logo = box(24);
  const abbr = span("NE", px(REM.abbr), ABBR_WEIGHT, {
    family: ABBR_FAMILY,
    letterSpacing: "0.04em",
  });
  const odds = span("+162", px(REM.odds), "700", { letterSpacing: "0.04em" });
  const score = span("24", px(REM.score), "700");

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
