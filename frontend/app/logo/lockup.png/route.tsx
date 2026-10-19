import { Children, cloneElement, isValidElement } from "react";
import type { CSSProperties, ReactElement, ReactNode } from "react";
import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import path from "node:path";
import LogoWordmark, { WORDMARK_FONT_RATIO } from "@/components/LogoWordmark";

export const runtime = "nodejs";

const ACCENT = "#2B5DE3";

const BLOCKIFY: Record<string, string> = {
  "inline-flex": "flex",
  "inline-block": "block",
};

type StyledProps = { style?: CSSProperties; children?: ReactNode };

function satoriSafe(node: ReactNode): ReactNode {
  if (Array.isArray(node)) return node.map(satoriSafe);
  if (!isValidElement<StyledProps>(node)) return node;

  const { style, children } = node.props;
  const display = style?.display as string | undefined;
  const patch =
    display && BLOCKIFY[display]
      ? { style: { ...style, display: BLOCKIFY[display] } }
      : {};

  return children === undefined
    ? cloneElement(node, patch)
    : cloneElement(node, patch, satoriSafe(children));
}

const DESCENT_EM = 0.26;

function lockupEl(height: number) {
  const el = LogoWordmark({
    height,
    bare: true,
    fontFamily: "Arca Majora 3",
  }) as ReactElement<StyledProps>;

  const fontSize = height * WORDMARK_FONT_RATIO;
  const kids = Children.toArray(el.props.children) as ReactElement<StyledProps>[];
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

  const num = (key: string, dflt: number, min: number, max: number) => {
    const raw = q.get(key);
    if (raw === null) return dflt;
    const n = Number(raw);
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : dflt;
  };

  const width = num("w", 1600, 16, 4096);
  const height = num("h", 600, 16, 4096);
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
