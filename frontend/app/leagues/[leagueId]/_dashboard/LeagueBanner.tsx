import { fmtMoney } from "@/lib/money";
import type { League } from "@/lib/types";

function Fact({ label, value }: { label: string; value: string | number }) {
  return (
    <span style={{ fontSize: "0.72rem", color: "var(--text-2)" }}>
      <span style={{ fontWeight: 700, color: "var(--text-3)" }}>{label}:</span> {value}
    </span>
  );
}

export default function LeagueBanner({ league, teams, color }: { league: League; teams: number; color: string }) {
  const name = league.name;
  return (
    <div className="lg-main" style={{ gridColumn: "2", gridRow: "1" }}>
      <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden", position: "relative", minHeight: 160 }}>
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 8, background: color }} />
        <div style={{ padding: "20px 20px 20px", position: "relative" }}>
          <div style={{ fontSize: "1.5rem", fontWeight: 800, letterSpacing: "-0.03em", color: "var(--text)", lineHeight: 1.15 }}>
            {name.endsWith(" League")
              ? <>{name.slice(0, -7)}<br /><span style={{ color: "var(--text-3)" }}>League</span></>
              : name}
          </div>
        </div>
        <div className="league-banner-stats" style={{ position: "absolute", top: 20, right: 14, display: "flex", flexDirection: "column", gap: 5 }}>
          <Fact label="Format" value="Standard" />
          <Fact label="Allowance" value={fmtMoney(league.weeklyAllowance)} />
          <Fact label="Teams" value={teams} />
        </div>
      </div>
    </div>
  );
}

export function ChampionBanner({ name }: { name: string }) {
  return (
    <div style={{
      background: "linear-gradient(135deg, #5a3800 0%, #a06c00 100%)",
      borderRadius: "var(--radius)", padding: "14px 16px", marginBottom: 14, color: "#fff",
      display: "flex", alignItems: "center", gap: 12, border: "1px solid rgba(200,150,12,0.4)",
    }}>
      <span style={{ fontSize: "1.8rem" }}>🏆</span>
      <div>
        <div style={{ fontWeight: 700, fontSize: "0.63rem", letterSpacing: "0.14em", textTransform: "uppercase", opacity: 0.65, marginBottom: 2 }}>Season Complete</div>
        <div style={{ fontWeight: 800, fontSize: "0.95rem" }}>Champion: {name}</div>
      </div>
    </div>
  );
}
