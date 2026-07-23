// Temporary placeholder — swap the contents of this component when the real logo is ready
export default function Logo({ size = 28 }: { size?: number }) {
  return (
    <div style={{
      width: size,
      height: size,
      flexShrink: 0,
      borderRadius: 4,
      border: "1.5px solid var(--border-2)",
      background: "var(--surface-3)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontSize: size * 0.24,
      fontWeight: 800,
      letterSpacing: "0.04em",
      color: "var(--text-3)",
      userSelect: "none",
    }}>
      LOGO
    </div>
  );
}
