"use client";

import type { CSSProperties } from "react";

const BAR_BG = "var(--header-bg)";

const BAR_H = 40;

const TEXT_PX = 14;

const linkStyle: CSSProperties = {
  fontFamily: "var(--font-sans), system-ui, sans-serif",
  fontWeight: 500,
  letterSpacing: "normal",
  textTransform: "none",
  lineHeight: "normal",
  display: "inline-block",
  whiteSpace: "nowrap",
  fontSize: TEXT_PX,
  color: "#FFFFFF",
};

const ctaStyle: CSSProperties = {
  ...linkStyle,
  fontWeight: 600,
};

export default function TopBar({ onDismiss }: { onDismiss?: () => void }) {
  return (
    <div style={{
      flexShrink: 0,
      background: BAR_BG,
      height: BAR_H,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      // Fill stays full-bleed; only the contents inset. Same token as `.nav`.
      padding: "0 var(--rail)",
      boxSizing: "border-box",
      // Positioning context for the dismiss button.
      position: "relative",
      zIndex: 300,
    }}>
      <span className="lp-tagline" style={{ ...linkStyle, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>
        NFL season is here &mdash; Play now for completely free.
      </span>

      {onDismiss && (
        <button
          type="button"
          className="tap-target"
          aria-label="Hide the tagline bar"
          title="Hide"
          onClick={onDismiss}
          style={{
            ...ctaStyle,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "none",
            border: "none",
            borderRadius: 0,
            boxShadow: "none",
            padding: 0,
            position: "absolute",
            right: 20,
            top: 0,
            bottom: 0,
            cursor: "pointer",
            lineHeight: 1,
          }}
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none"
               stroke="currentColor" strokeWidth={2.5} strokeLinecap="round"
               aria-hidden="true">
            <path d="M5 5 L19 19 M19 5 L5 19" />
          </svg>
        </button>
      )}
    </div>
  );
}
