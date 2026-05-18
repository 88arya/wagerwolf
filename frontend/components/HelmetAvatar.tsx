interface Props {
  color: string;
  initials: string;
  size?: number;
}

export const HELMET_COLORS = [
  // Red
  "#fca5a5", "#f87171", "#dc2626", "#7f1d1d",
  // Orange
  "#fdba74", "#fb923c", "#ea580c", "#7c2d12",
  // Yellow
  "#fde68a", "#fbbf24", "#d97706", "#92400e",
  // Green
  "#86efac", "#4ade80", "#16a34a", "#14532d",
  // Blue
  "#93c5fd", "#60a5fa", "#2563eb", "#1e3a8a",
  // Purple
  "#c4b5fd", "#a78bfa", "#7c3aed", "#4c1d95",
  // Pink
  "#f9a8d4", "#f472b6", "#db2777", "#831843",
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
