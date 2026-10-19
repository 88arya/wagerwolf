import type { CSSProperties, ReactNode } from "react";

export const panelTitle: CSSProperties = {
  fontSize: "0.58rem", fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--text)",
};

export const emptyText: CSSProperties = { fontSize: "0.75rem", color: "var(--text-3)" };

// A card with a small uppercase title bar.
export default function Panel({ title, className = "card", style, children }: {
  title: string;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}) {
  return (
    <div className={className} style={{ padding: 0, overflow: "hidden", background: "var(--surface)", ...style }}>
      <div style={{ padding: "8px 12px", borderBottom: "1px solid var(--border)", background: "var(--surface)" }}>
        <span style={panelTitle}>{title}</span>
      </div>
      {children}
    </div>
  );
}
