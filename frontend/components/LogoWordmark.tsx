import type { CSSProperties } from "react";
import Logo from "@/components/Logo";

export const WORDMARK_FONT_RATIO = 0.7;

const GAP_RATIO = 0.3;

const MARK_RATIO = 0.721;
/** Half the leftover, so the head sits in the panel exactly as it sat in the tile. */
const PANEL_PAD_RATIO = (1 - MARK_RATIO) / 2;

const STACKED_GAP_SCALE = 0.7;

const WORDMARK_CAP_RATIO = 0.77;

const LOCKUP_INK_SHIFT_EM = 0.065;

const OPTICAL_SHIFT_EM = 0;

export const WORDMARK_TEXT: CSSProperties = {
  fontFamily: "var(--font-arca-majora), var(--font-sans), system-ui, sans-serif",
  fontWeight: 700,
  letterSpacing: "normal",
  textTransform: "lowercase",
  lineHeight: "normal",
  display: "inline-block",
  position: "relative",
  top: `${OPTICAL_SHIFT_EM}em`,
  whiteSpace: "nowrap",
};

export default function LogoWordmark({
  height = 28,
  bare = false,
  fontFamily,
  fontWeight,
  layout = "mark-right",
  textTransform,
  align = "baseline",
  markScale = WORDMARK_CAP_RATIO,
}: {
  /** Height of the mark. The type is sized from it, so this sizes the lockup. */
  height?: number;
  bare?: boolean;
  fontFamily?: string;
  fontWeight?: number;
  layout?: "mark-left" | "mark-right" | "mark-top";
  textTransform?: "none" | "lowercase" | "uppercase";
  align?: "center" | "baseline";
  markScale?: number | null;
}) {
  const fontSize = height * WORDMARK_FONT_RATIO;
  const markSize =
    markScale != null ? fontSize * markScale : bare ? height : height * MARK_RATIO;
  const stacked = layout === "mark-top";

  return (
    <span
      style={{
        display: "inline-flex",
        flexDirection: stacked ? "column" : layout === "mark-right" ? "row-reverse" : "row",
        // Stacked, this axis is the horizontal one and must stay centred.
        alignItems: !stacked && align === "baseline" ? "baseline" : "center",
        gap: markSize * GAP_RATIO * (stacked ? STACKED_GAP_SCALE : 1),
        lineHeight: 1,
        position: "relative",
        top: fontSize * LOCKUP_INK_SHIFT_EM,
        WebkitUserSelect: "none",
        userSelect: "none",
        ...(bare
          ? null
          : {
              background: "var(--accent)",
              color: "#FFFFFF",
              padding: `${height * PANEL_PAD_RATIO}px ${height * PANEL_PAD_RATIO * 1.6}px`,
            }),
      }}
    >
      <span aria-hidden="true" style={{ display: "flex" }}>
        <Logo size={markSize} bare />
      </span>
      <span
        style={{
          ...WORDMARK_TEXT,
          fontSize,
          ...(fontFamily ? { fontFamily } : null),
          ...(fontWeight ? { fontWeight } : null),
          ...(textTransform ? { textTransform } : null),
        }}
      >
        Wagerwolf
      </span>
    </span>
  );
}
