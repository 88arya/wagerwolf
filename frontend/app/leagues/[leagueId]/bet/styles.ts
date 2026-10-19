import type { CSSProperties } from "react";

export const BOX_W = "var(--sl-box-w, 110px)";
export const PROP_BOX_W = "var(--pr-box-w, 110px)";
export const BOX_H = 42;

// Gap between odds boxes: 3 device pixels, so it renders crisply at any zoom.
export const BOX_GAP = "var(--box-gap)";
const GAP_DEVICE_PX = 3;

export function boxGapStyle(dpr: number): CSSProperties {
  return { ["--box-gap"]: `${GAP_DEVICE_PX / dpr}px` } as CSSProperties;
}

export function hairline(dpr: number): CSSProperties {
  return { height: 1 / dpr, background: "var(--border)", margin: "0 12px" };
}

export const STRIPES =
  "repeating-linear-gradient(45deg, var(--stripe) 0px, var(--stripe) 1.5px, transparent 1.5px, transparent 7px)";

export const panel: CSSProperties = { background: "var(--surface)", borderRadius: "var(--radius)", overflow: "hidden" };

export const sectionTitle: CSSProperties = { fontSize: "0.75rem", fontWeight: 700, color: "var(--text)" };

export const columnHeading: CSSProperties = {
  width: BOX_W, textAlign: "center", fontSize: "0.48rem", color: "var(--text-2)",
  letterSpacing: "0.07em", textTransform: "uppercase",
};

export const teamName: CSSProperties = {
  fontWeight: 700, fontSize: "0.85rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
};

export const arrowButton: CSSProperties = {
  width: 24, flexShrink: 0, background: "none", border: "none", cursor: "pointer",
  color: "var(--text-2)", fontSize: "1rem", display: "flex", alignItems: "center", justifyContent: "center",
};

export const pageStyle = (dpr: number): CSSProperties => ({ paddingBottom: 160, ...boxGapStyle(dpr) });
