"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";

// The three promo mechanics. There's no offers model or endpoint yet, so each
// kind renders its own empty state — swap the placeholder footer for offer
// rows once there's something to read.
const SPECIAL_KINDS = [
  { key: "PROFIT_BOOST", label: "Profit Boosts", blurb: "A multiplier on the profit of a winning bet. Your stake pays out as normal." },
  { key: "BET_REFUND",   label: "Bet Refunds",   blurb: "Lose by a set margin and the stake comes back to your balance." },
  { key: "NO_SWEAT_BET", label: "No Sweat Bets", blurb: "If the bet loses you get the stake back. If it wins it pays as normal." },
];

export default function SpecialsPage({ params }: PageProps<"/leagues/[leagueId]/specials">) {
  const router = useRouter();
  const [week, setWeek] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function init() {
      if (!localStorage.getItem("token")) { router.push("/"); return; }
      const { leagueId: lid } = await params;

      try {
        const weeks = await api(`/weeks?current=true&leagueId=${lid}`);
        setWeek(weeks?.[0] ?? null);
      } catch {}

      setLoading(false);
    }
    init();
  }, []);

  // 260px min fits all three kinds on one row at the 860px content width,
  // then falls back to 2-up / 1-up on narrower screens.
  const grid = { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 260px), 1fr))", gap: 8, alignItems: "start" } as const;

  return (
    <div className="page-wide" style={{ display: "flex", flexDirection: "column", alignItems: "center", paddingTop: "5vh" }}>

      <div style={{ width: "100%", maxWidth: 860, marginBottom: 16, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ fontWeight: 900, fontSize: "1.1rem", letterSpacing: "-0.01em", color: "var(--text)" }}>Specials</div>
        {week && (
          <div style={{ fontSize: "0.72rem", color: "var(--text-3)" }}>
            {week.resolved ? "Final" : week.locked ? "Locked" : "Current week"}
          </div>
        )}
      </div>

      <div style={{ width: "100%", maxWidth: 860 }}>

        {loading && <div className="loading" style={{ height: "20vh" }}>Loading…</div>}

        {!loading && (
          <div style={grid}>
            {SPECIAL_KINDS.map(({ key, label, blurb }) => (
              <div key={key} className="card">
                <div style={{ fontSize: "0.8rem", fontWeight: 700, color: "var(--text)" }}>{label}</div>
                <div style={{ fontSize: "0.75rem", color: "var(--text-2)", marginTop: 4, lineHeight: 1.45 }}>{blurb}</div>
                <div style={{ marginTop: 12, paddingTop: 10, borderTop: "1px solid var(--border)", fontSize: "0.75rem", color: "var(--text-3)" }}>
                  {week?.locked ? "Betting locked" : "No offers this week"}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
