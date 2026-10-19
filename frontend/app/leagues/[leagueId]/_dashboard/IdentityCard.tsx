import HelmetAvatar from "@/components/HelmetAvatar";
import { fmtMoney } from "@/lib/money";
import type { Standing } from "@/lib/types";

function PencilIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  );
}

function StatRow({ label, value }: { label: string; value: string | number }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 10px" }}>
      <span style={{ fontSize: "0.8rem", fontWeight: 700, color: "var(--text)" }}>{label}</span>
      <span style={{ fontSize: "0.72rem", color: "var(--text-3)", fontVariantNumeric: "tabular-nums" }}>{value}</span>
    </div>
  );
}

// The signed-in member's helmet, name, tag, balance and pending bet count.
export default function IdentityCard({ member, helmetColor, liveBets, onEdit }: {
  member: Standing;
  helmetColor: string;
  liveBets: number;
  onEdit: () => void;
}) {
  return (
    <div className="card lg-main" style={{
      gridColumn: "1", gridRow: "1", padding: "14px 16px", background: "var(--surface)", minHeight: 160,
      display: "flex", flexDirection: "column", justifyContent: "space-between", minWidth: 0,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12, marginTop: 10, paddingLeft: 10, paddingRight: 10 }}>
        <HelmetAvatar color={helmetColor} initials={member.displayName.slice(0, 2)} size={48} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: "0.9rem", fontWeight: 700, color: "var(--text)", marginBottom: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {member.displayName}
          </div>
          <div style={{ fontSize: "0.65rem", fontWeight: 800, color: "var(--text-3)", letterSpacing: "0.1em", textTransform: "uppercase" }}>
            {member.abbreviation || member.displayName.slice(0, 3).toUpperCase()}
          </div>
        </div>
        <button
          onClick={onEdit}
          style={{ background: "none", border: "none", padding: 3, cursor: "pointer", color: "var(--text-3)", display: "flex", alignItems: "center", borderRadius: 4, lineHeight: 1, flexShrink: 0 }}
          title="Edit your league identity"
        >
          <PencilIcon />
        </button>
      </div>
      <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, boxShadow: "var(--shadow-sm)" }}>
        <StatRow label="Balance" value={fmtMoney(member.balance)} />
        <StatRow label="Live Bets" value={liveBets} />
      </div>
    </div>
  );
}
