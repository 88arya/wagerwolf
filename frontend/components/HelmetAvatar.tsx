interface Props {
  color: string;
  initials: string;
  size?: number;
}

export const HELMET_COLORS = [
  "#2563EB", "#1d4ed8", "#1e40af", "#3b82f6", "#60a5fa",
  "#0891b2", "#0e7490", "#06b6d4",
  "#dc2626", "#b91c1c", "#ef4444",
  "#e11d48", "#9f1239", "#be185d", "#ec4899",
  "#7c3aed", "#6d28d9", "#a855f7",
  "#16a34a", "#15803d", "#059669", "#065f46",
  "#ea580c", "#c2410c",
  "#d97706", "#b45309", "#f59e0b",
  "#0f172a", "#1e293b", "#374151", "#78716c",
];

export default function HelmetAvatar({ color, initials, size = 36 }: Props) {
  return (
    <svg width={size} height={size} viewBox="0 0 256 256" style={{ display: "block", filter: "drop-shadow(0 1px 3px rgba(0,0,0,0.22))", flexShrink: 0 }}>
      {/* Helmet body filled with user color */}
      <path
        d="M120,200a8,8,0,0,0,7.81-9.74l-15.62-52.52A8,8,0,0,1,120,128h96v-4a92,92,0,0,0-93.31-92C72.65,32.71,32,73.92,32,124a91.91,91.91,0,0,0,40.14,76Z"
        fill={color} stroke="rgba(0,0,0,0.22)" strokeWidth="10" strokeLinecap="round" strokeLinejoin="round"
      />
      {/* Earhole */}
      <circle cx="84" cy="164" r="12" fill="rgba(0,0,0,0.35)"/>
      {/* Facemask */}
      <path
        d="M148,128l24.31,82.27A8,8,0,0,0,180,216h36a8,8,0,0,0,8-8V176a8,8,0,0,0-8-8H121.19"
        fill="rgba(0,0,0,0.15)" stroke="#94a3b8" strokeWidth="12" strokeLinecap="round" strokeLinejoin="round"
      />
    </svg>
  );
}
