"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import BottomNav from "@/components/BottomNav";

function fmtOdds(n: number) { return n > 0 ? `+${n}` : `${n}`; }
function fmtStatType(s: string) { return s.replaceAll("_", " "); }

export default function MemberProfilePage({ params }: PageProps<"/leagues/[leagueId]/members/[userId]">) {
  const router = useRouter();
  const [leagueId, setLeagueId] = useState("");
  const [userId, setUserId] = useState("");
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      if (!localStorage.getItem("token")) { router.push("/"); return; }
      const { leagueId: lid, userId: uid } = await params;
      setLeagueId(lid);
      setUserId(uid);
      try {
        const data = await api(`/leagues/${lid}/members/${uid}/stats`);
        setStats(data);
      } catch {
        router.push(`/leagues/${lid}`);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading || !stats) {
    return <div className="loading">Loading…</div>;
  }

  const isMe = userId === localStorage.getItem("userId");

  const statColors: Record<string, string> = {
    PASSING_YARDS: "#60A5FA",
    RUSHING_YARDS: "#34D399",
    RECEIVING_YARDS: "#F472B6",
    TOUCHDOWNS: "#FBBF24",
    RECEPTIONS: "#A78BFA",
  };

  const streakLabel = stats.streak > 0
    ? { text: `${stats.streak}W streak`, color: "var(--win)" }
    : stats.streak < 0
      ? { text: `${Math.abs(stats.streak)}L streak`, color: "var(--loss)" }
      : null;

  const roiColor = stats.roi > 0 ? "var(--win)" : stats.roi < 0 ? "var(--loss)" : "var(--text-2)";

  return (
    <>
      <nav className="nav">
        <div className="nav-logo">PLAY<span className="accent">BOOK</span></div>
        <Link href={`/leagues/${leagueId}`} style={{ fontSize: "0.82rem" }}>‹ Home</Link>
      </nav>

      <div className="page" style={{ paddingBottom: 100 }}>
        {/* Header */}
        <div className="card" style={{ marginBottom: 12, textAlign: "center", padding: "24px 20px" }}>
          <div style={{
            width: 64, height: 64, borderRadius: "50%",
            background: "var(--accent-dim)", border: "2px solid var(--accent)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: "1.4rem", fontWeight: 900, color: "var(--accent)",
            margin: "0 auto 12px",
          }}>
            {stats.displayName.slice(0, 2).toUpperCase()}
          </div>
          <div style={{ fontWeight: 900, fontSize: "1.2rem", color: "var(--text)", marginBottom: 4 }}>
            {stats.displayName}
            {isMe && <span style={{ marginLeft: 8, fontSize: "0.7rem", color: "var(--accent)", fontWeight: 700 }}>YOU</span>}
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
            <span style={{ color: "var(--text-3)", fontSize: "0.8rem" }}>#{stats.rank} in league</span>
            {streakLabel && (
              <span style={{ fontSize: "0.72rem", fontWeight: 800, color: streakLabel.color, background: `${streakLabel.color}15`, borderRadius: 4, padding: "2px 7px" }}>
                {streakLabel.text}
              </span>
            )}
          </div>
        </div>

        {/* Stats grid */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
          {[
            { label: "Balance", value: `$${stats.balance.toLocaleString()}`, color: "var(--accent)" },
            { label: "Record", value: `${stats.wins}–${stats.losses}${stats.ties > 0 ? `–${stats.ties}` : ""}`, color: "var(--text)" },
            { label: "Win Rate", value: (stats.wonPicks + stats.lostPicks) > 0 ? `${Math.round(stats.wonPicks / (stats.wonPicks + stats.lostPicks) * 100)}%` : "—", color: "var(--text)" },
            { label: "ROI", value: stats.totalStaked > 0 ? `${stats.roi > 0 ? "+" : ""}${stats.roi}%` : "—", color: roiColor },
            { label: "Total Bets", value: String(stats.totalPicks), color: "var(--text)" },
            { label: "Profit", value: stats.totalProfit !== 0 ? `${stats.totalProfit > 0 ? "+" : ""}$${stats.totalProfit.toLocaleString()}` : "$0", color: stats.totalProfit > 0 ? "var(--win)" : stats.totalProfit < 0 ? "var(--loss)" : "var(--text-2)" },
          ].map(({ label, value, color }) => (
            <div key={label} className="card" style={{ margin: 0, textAlign: "center", padding: "12px 8px" }}>
              <div className="label" style={{ marginBottom: 4 }}>{label}</div>
              <div style={{ fontSize: "1.2rem", fontWeight: 900, color, fontVariantNumeric: "tabular-nums" }}>{value}</div>
            </div>
          ))}
        </div>

        {/* Best / worst stat types */}
        {(stats.bestStatType || stats.worstStatType) && (
          <div className="card" style={{ marginBottom: 12 }}>
            <div style={{ fontSize: "0.66rem", fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--text-3)", marginBottom: 12 }}>
              Prop Performance
            </div>
            {stats.bestStatType && (
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ width: 8, height: 8, borderRadius: "50%", background: statColors[stats.bestStatType.statType] ?? "var(--accent)" }} />
                  <span style={{ fontSize: "0.85rem", fontWeight: 600 }}>{fmtStatType(stats.bestStatType.statType)}</span>
                  <span style={{ fontSize: "0.7rem", color: "var(--win)", fontWeight: 700 }}>Best</span>
                </div>
                <span style={{ fontWeight: 800, color: "var(--win)", fontVariantNumeric: "tabular-nums", fontSize: "0.9rem" }}>
                  +${stats.bestStatType.profit.toLocaleString()}
                </span>
              </div>
            )}
            {stats.worstStatType && stats.worstStatType.statType !== stats.bestStatType?.statType && (
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ width: 8, height: 8, borderRadius: "50%", background: statColors[stats.worstStatType.statType] ?? "var(--text-3)" }} />
                  <span style={{ fontSize: "0.85rem", fontWeight: 600 }}>{fmtStatType(stats.worstStatType.statType)}</span>
                  <span style={{ fontSize: "0.7rem", color: "var(--loss)", fontWeight: 700 }}>Worst</span>
                </div>
                <span style={{ fontWeight: 800, color: "var(--loss)", fontVariantNumeric: "tabular-nums", fontSize: "0.9rem" }}>
                  ${stats.worstStatType.profit.toLocaleString()}
                </span>
              </div>
            )}
          </div>
        )}

        {/* Recent picks */}
        {stats.recentPicks?.length > 0 && (
          <>
            <div className="section-title" style={{ marginBottom: 8 }}>Recent Picks</div>
            <div className="card" style={{ padding: 0, overflow: "hidden" }}>
              {stats.recentPicks.map((pick: any, idx: number) => {
                const outcomeColor = pick.outcome === "WIN" ? "var(--win)" : pick.outcome === "LOSS" ? "var(--loss)" : "var(--text-3)";
                const line = pick.altLine ?? pick.line;
                return (
                  <div key={pick.id} style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "11px 16px",
                    borderBottom: idx < stats.recentPicks.length - 1 ? "1px solid var(--border)" : "none",
                  }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: "0.88rem", color: "var(--text)", marginBottom: 2 }}>
                        {pick.playerName}
                      </div>
                      <div style={{ fontSize: "0.72rem", color: "var(--text-3)" }}>
                        {pick.direction} {line} {fmtStatType(pick.statType)} · {fmtOdds(pick.odds)}
                      </div>
                    </div>
                    <div style={{ textAlign: "right", flexShrink: 0 }}>
                      <div style={{ fontSize: "0.78rem", fontWeight: 800, color: outcomeColor }}>
                        {pick.outcome === "WIN" ? "WIN" : pick.outcome === "LOSS" ? "LOSS" : "—"}
                      </div>
                      <div style={{ fontSize: "0.7rem", color: "var(--text-3)" }}>${pick.stake.toLocaleString()}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {stats.recentPicks?.length === 0 && (
          <div className="card">
            <div className="empty">
              <div className="empty-icon">🎯</div>
              <div className="empty-text">No bets placed yet</div>
            </div>
          </div>
        )}
      </div>

      <BottomNav leagueId={leagueId} />
    </>
  );
}
