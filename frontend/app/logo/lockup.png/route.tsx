/**
 * TEMPORARY export route — renders the real lockup to PNG.
 *
 * The point of it is that it renders <LogoWordmark /> ITSELF rather than a
 * hand-rebuilt copy of its geometry. A copy was tried and got the arrangement
 * wrong: `layout` defaults to "mark-right", so the mark sits AFTER the name,
 * and a reimplementation put it in front. Rendering the component means the
 * export cannot disagree with the nav about what the lockup is.
 *
 * Two things have to be handed in by hand, and both are the same exemption
 * app/opengraph-image.tsx already takes: this renders in a Node canvas with no
 * document and no cascade, so `var(--font-arca-majora)` has nothing to resolve
 * against (hence the `fontFamily` prop) and `var(--accent)` likewise (hence the
 * literal). Keep the hex in step with --accent in globals.css.
 */
import { Children, cloneElement, isValidElement } from "react";
import type { CSSProperties, ReactElement, ReactNode } from "react";
import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import path from "node:path";
import LogoWordmark, { WORDMARK_FONT_RATIO } from "@/components/LogoWordmark";

export const runtime = "nodejs";

const ACCENT = "#2B5DE3";

/**
 * The component's OWN element tree, with the inline display values blockified.
 *
 * Satori accepts only flex / block / contents / none / -webkit-box for
 * `display` and THROWS on anything else. The lockup uses two it rejects: the
 * root span is `inline-flex` and the name's wrapper is `inline-block`. So the
 * tree is walked and each is mapped to its block equivalent.
 *
 * THIS IS NOT A FUDGE, and the reason matters. `inline-*` differs from its
 * block counterpart only in how the box behaves in ITS PARENT'S inline flow —
 * and every one of these boxes is a flex item (the root is the only child of
 * the centring container below; the name sits in the lockup's own flex row).
 * CSS blockifies flex items itself: an `inline-block` child of a flex container
 * computes to `block`. The map is what the browser already does, applied by
 * hand because satori does not do it.
 *
 * Everything that decides how the lockup LOOKS is untouched: the row-reverse
 * from `layout: "mark-right"`, WORDMARK_FONT_RATIO, GAP_RATIO, the baseline
 * alignment and LOCKUP_INK_SHIFT_EM all come straight from the component.
 * Reimplementing those is exactly the mistake this route exists to prevent —
 * the hand-built copy it replaced put the mark on the wrong side of the name.
 *
 * Calling the component rather than rendering it works because LogoWordmark is
 * pure: no hooks, no context. If it ever takes either, this has to become a
 * real render.
 */
const BLOCKIFY: Record<string, string> = {
  "inline-flex": "flex",
  "inline-block": "block",
};

type StyledProps = { style?: CSSProperties; children?: ReactNode };

function satoriSafe(node: ReactNode): ReactNode {
  if (Array.isArray(node)) return node.map(satoriSafe);
  // The type argument is what makes `node.props` typed rather than `unknown`,
  // which is what cloneElement needs to accept a `style` override.
  if (!isValidElement<StyledProps>(node)) return node;

  const { style, children } = node.props;
  const display = style?.display as string | undefined;
  const patch =
    display && BLOCKIFY[display]
      ? { style: { ...style, display: BLOCKIFY[display] } }
      : {};

  // Passing children explicitly REPLACES them, so an element that has none must
  // not be handed `undefined` — that would blank out a self-closing <path>.
  return children === undefined
    ? cloneElement(node, patch)
    : cloneElement(node, patch, satoriSafe(children));
}

/**
 * Arca Majora 3's descent: hhea descent 260 / unitsPerEm 1000 — the same table
 * LogoWordmark reads cap 770 and ascent 900 out of for LOCKUP_INK_SHIFT_EM.
 */
const DESCENT_EM = 0.26;

/**
 * SATORI DOES NOT SYNTHESISE A BASELINE FOR A TEXT-LESS FLEX ITEM, and that is
 * the second thing this file has to correct for.
 *
 * The lockup is `align-items: baseline`, and the component's own comment
 * explains what that buys in a browser: the mark's wrapper holds no text, so
 * CSS synthesises its baseline from its bottom margin edge, which puts the
 * mark's BOTTOM on the name's baseline. Descenders — the g in "wagerwolf" —
 * then hang below the mark instead of dragging it down.
 *
 * Satori has no such synthesis. It aligned the mark's bottom to the bottom of
 * the text's BOX, i.e. baseline + descent, dropping the mark a full descender
 * below where it belongs. Measured in the first render at lockup 280: mark
 * bottom y=425 against a baseline of y≈375, a 50px error, where descent x
 * fontSize is 0.26 x 196 = 50.96. That is the whole of the discrepancy.
 *
 * So the relationship is rebuilt explicitly: align to `flex-end` — which satori
 * does implement — and lift the mark by exactly the descent. Same result as the
 * browser's baseline, arrived at from the face's own metric instead of from a
 * feature satori lacks.
 *
 * The `position: relative` / `top` ink shift is dropped with it. That exists to
 * optically centre the lockup inside a BAR whose height it does not control;
 * here the canvas is cropped to the ink and padded symmetrically afterwards, so
 * applying it would shift the ink off the centre this route computes.
 */
function lockupEl(height: number) {
  const el = LogoWordmark({
    height,
    bare: true,
    fontFamily: "Arca Majora 3",
  }) as ReactElement<StyledProps>;

  const fontSize = height * WORDMARK_FONT_RATIO;
  const kids = Children.toArray(el.props.children) as ReactElement<StyledProps>[];
  // Child 0 is the mark's aria-hidden wrapper, child 1 the name — see the tail
  // of LogoWordmark. Index rather than a search, because the order is also what
  // `layout: "mark-right"` reverses, and a search would hide a change to it.
  const [mark, name] = kids;

  const { position: _p, top: _t, ...rest } = el.props.style ?? {};

  return satoriSafe(
    cloneElement(
      el,
      { style: { ...rest, display: "flex", alignItems: "flex-end" } },
      cloneElement(mark, {
        style: { ...mark.props.style, marginBottom: fontSize * DESCENT_EM },
      }),
      name,
    ),
  );
}

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;

  /* CLAMPED, because this is a public route and the numbers are a canvas
     allocation. `?w=100000&h=100000` is ten gigapixels of rasterisation on one
     unauthenticated GET — the whole of the DoS surface here, and four calls to
     `num` closes it. NaN falls back to the default rather than through it. */
  const num = (key: string, dflt: number, min: number, max: number) => {
    // THE NULL CHECK IS NOT REDUNDANT. `Number(null)` is 0, not NaN, so a
    // missing parameter passes Number.isFinite and clamps to `min` — every
    // default silently became the minimum and the first render off this came
    // out 16x16.
    const raw = q.get(key);
    if (raw === null) return dflt;
    const n = Number(raw);
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : dflt;
  };

  const width = num("w", 1600, 16, 4096);
  const height = num("h", 600, 16, 4096);
  // `height` sizes the MARK; the name follows through WORDMARK_FONT_RATIO and
  // the gap through GAP_RATIO, so this one number scales the whole lockup —
  // exactly as SiteNav's LOCKUP_H does at 27.
  const lockup = num("lockup", 280, 8, 2048);
  const bg = q.get("bg") ?? ACCENT;
  const fg = q.get("fg") ?? "#FFFFFF";

  const font = await readFile(
    path.join(process.cwd(), "app/fonts/arca-majora/ArcaMajora3-Bold.otf"),
  );

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: bg,
          // `bare` draws head AND name in currentColor, so one colour here
          // reaches both — the same thing SiteFooter relies on.
          color: fg,
        }}
      >
        {lockupEl(lockup)}
      </div>
    ),
    {
      width,
      height,
      fonts: [
        { name: "Arca Majora 3", data: font, weight: 700, style: "normal" },
      ],
    },
  );
}
