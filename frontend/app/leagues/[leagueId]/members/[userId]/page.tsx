"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ACCENT } from "@/lib/constants";
import { api } from "@/lib/api";
import HelmetAvatar from "@/components/HelmetAvatar";

function fmtOdds(n: number) { return n > 0 ? `+${n}` : `${n}`; }
function fmtStatType(s: string) { return s.split("_").map((w: string) => w[0] + w.slice(1).toLowerCase()).join(" "); }

function CardHeader({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ padding: "8px 14px", borderBottom: "1px solid var(--border)" }}>
      <span style={{ fontSize: "0.58rem", fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--text)" }}>{children}</span>
    </div>
  );
}

export default function MemberProfilePage({ params }: PageProps<"/leagues/[leagueId]/members/[userId]">) {
  const router = useRouter();
  const [userId, setUserId] = useState("");
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      if (!localStorage.getItem("token")) { router.push("/"); return; }
      const { leagueId: lid, userId: uid } = await params;
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

  const streakLabel = stats.streak > 0
    ? { text: `W${stats.streak}`, color: "var(--win)" }
    : stats.streak < 0
      ? { text: `L${Math.abs(stats.streak)}`, color: "var(--loss)" }
      : null;

  const roiColor = stats.roi > 0 ? "var(--win)" : stats.roi < 0 ? "var(--loss)" : "var(--text)";

  return (
    <div className="page-wide" style={{ display: "flex", flexDirection: "column", alignItems: "center", paddingTop: "5vh" }}>

      {/* Header row: identity */}
      <div style={{ width: "100%", maxWidth: 860, marginBottom: 16, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
          <HelmetAvatar color={stats.helmetColor ?? ACCENT} initials={stats.abbreviation || stats.displayName.slice(0, 2).toUpperCase()} size={40} />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 900, fontSize: "1.1rem", letterSpacing: "-0.01em", color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {stats.displayName}
              {isMe && <span style={{ fontSize: "0.65rem", color: "var(--text-3)", fontWeight: 400, marginLeft: 8 }}>you</span>}
            </div>
            {stats.abbreviation && (
              <div style={{ fontSize: "0.6rem", color: "var(--text)", fontWeight: 700, fontStyle: "italic", letterSpacing: "0.1em", marginTop: 1 }}>{stats.abbreviation}</div>
            )}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
          <span style={{ fontSize: "0.72rem", color: "var(--text-3)" }}>#{stats.rank} in league</span>
          {streakLabel && (
            <span style={{ fontSize: "0.72rem", fontWeight: 700, color: streakLabel.color, fontVariantNumeric: "tabular-nums" }}>
              {streakLabel.text} streak
            </span>
          )}
        </div>
      </div>

      <div style={{ width: "100%", maxWidth: 860 }}>

        {/* Stat strip */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 8, marginBottom: 16 }}>
          {[
            { label: "Balance", value: `$${stats.balance.toLocaleString()}`, color: "var(--text)" },
            { label: "Record", value: `${stats.wins}-${stats.losses}-${stats.ties}`, color: "var(--text)" },
            { label: "Hit Rate", value: (stats.wonPicks + stats.lostPicks) > 0 ? `${Math.round(stats.wonPicks / (stats.wonPicks + stats.lostPicks) * 100)}%` : "—", color: "var(--text)" },
            { label: "ROI", value: stats.totalStaked > 0 ? `${stats.roi > 0 ? "+" : ""}${stats.roi}%` : "—", color: roiColor },
            { label: "Avg / Week", value: stats.avgWeeklyWinnings !== 0 ? `${stats.avgWeeklyWinnings > 0 ? "+" : "-"}$${Math.abs(stats.avgWeeklyWinnings).toLocaleString()}` : "—", color: stats.avgWeeklyWinnings > 0 ? "var(--win)" : stats.avgWeeklyWinnings < 0 ? "var(--loss)" : "var(--text)" },
            { label: "Profit", value: stats.totalProfit !== 0 ? `${stats.totalProfit > 0 ? "+" : "-"}$${Math.abs(stats.totalProfit).toLocaleString()}` : "$0", color: stats.totalProfit > 0 ? "var(--win)" : stats.totalProfit < 0 ? "var(--loss)" : "var(--text)" },
          ].map(({ label, value, color }) => (
            <div key={label} className="card" style={{ padding: "10px 12px" }}>
              <div style={{ fontSize: "0.55rem", color: "var(--text-3)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.09em", marginBottom: 2 }}>{label}</div>
              <div style={{ fontSize: "0.95rem", fontWeight: 800, color, fontVariantNumeric: "tabular-nums", letterSpacing: "-0.02em" }}>{value}</div>
            </div>
          ))}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, alignItems: "start" }}>

          {/* Left: hit rates */}
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {(stats.bestStatType || stats.worstStatType) && (
              <div className="card" style={{ padding: 0, overflow: "hidden" }}>
                <CardHeader>Prop Performance</CardHeader>
                <div style={{ padding: "4px 0" }}>
                  {stats.bestStatType && (
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "9px 14px", borderBottom: stats.worstStatType && stats.worstStatType.statType !== stats.bestStatType.statType ? "1px solid var(--border)" : "none" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontSize: "0.78rem", fontWeight: 500 }}>{fmtStatType(stats.bestStatType.statType)}</span>
                        <span className="badge badge-green">Best</span>
                      </div>
                      <span style={{ fontWeight: 700, color: "var(--win)", fontVariantNumeric: "tabular-nums", fontSize: "0.8rem" }}>
                        +${stats.bestStatType.profit.toLocaleString()}
                      </span>
                    </div>
                  )}
                  {stats.worstStatType && stats.worstStatType.statType !== stats.bestStatType?.statType && (
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "9px 14px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontSize: "0.78rem", fontWeight: 500 }}>{fmtStatType(stats.worstStatType.statType)}</span>
                        <span className="badge badge-red">Worst</span>
                      </div>
                      <span style={{ fontWeight: 700, color: "var(--loss)", fontVariantNumeric: "tabular-nums", fontSize: "0.8rem" }}>
                        ${stats.worstStatType.profit.toLocaleString()}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {stats.statTypeHitRates?.length > 0 && (
              <div className="card" style={{ padding: 0, overflow: "hidden" }}>
                <CardHeader>Hit Rates by Category</CardHeader>
                <div style={{ padding: 14 }}>
                  {stats.statTypeHitRates.map((s: any, idx: number) => {
                    const hitColor = s.hitRate >= 55 ? "var(--win)" : s.hitRate <= 40 ? "var(--loss)" : "var(--text-2)";
                    return (
                      <div key={s.statType} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: idx < stats.statTypeHitRates.length - 1 ? 10 : 0 }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: "0.78rem", fontWeight: 500, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {fmtStatType(s.statType)}
                          </div>
                          <div style={{ marginTop: 4, height: 3, borderRadius: 2, background: "var(--surface-3)", overflow: "hidden" }}>
                            <div style={{ height: "100%", width: `${s.hitRate}%`, background: hitColor, borderRadius: 2, transition: "width 0.3s" }} />
                          </div>
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", flexShrink: 0, gap: 1 }}>
                          <span style={{ fontSize: "0.8rem", fontWeight: 700, color: hitColor, fontVariantNumeric: "tabular-nums" }}>{s.hitRate}%</span>
                          <span style={{ fontSize: "0.62rem", color: "var(--text-3)", fontVariantNumeric: "tabular-nums" }}>{s.won}/{s.total}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Right: recent picks */}
          <div>
            <div className="card" style={{ padding: 0, overflow: "hidden" }}>
              <CardHeader>Recent Picks</CardHeader>
              {stats.recentPicks?.length > 0 ? (
                stats.recentPicks.map((pick: any, idx: number) => {
                  const outcomeColor = pick.outcome === "WIN" ? "var(--win)" : pick.outcome === "LOSS" ? "var(--loss)" : "var(--text-3)";
                  const line = pick.altLine ?? pick.line;
                  return (
                    <div key={pick.id} style={{
                      display: "flex", alignItems: "center", justifyContent: "space-between",
                      padding: "10px 14px",
                      borderBottom: idx < stats.recentPicks.length - 1 ? "1px solid var(--border)" : "none",
                    }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: "0.8rem", color: "var(--text)", marginBottom: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {pick.playerName}
                        </div>
                        <div style={{ fontSize: "0.68rem", color: "var(--text-3)" }}>
                          {pick.direction} {line} {fmtStatType(pick.statType)} · {fmtOdds(pick.odds)}
                        </div>
                      </div>
                      <div style={{ textAlign: "right", flexShrink: 0, marginLeft: 8 }}>
                        <div style={{ fontSize: "0.72rem", fontWeight: 700, color: outcomeColor }}>
                          {pick.outcome === "WIN" ? "WIN" : pick.outcome === "LOSS" ? "LOSS" : "—"}
                        </div>
                        <div style={{ fontSize: "0.68rem", color: "var(--text-3)", fontVariantNumeric: "tabular-nums" }}>
                          ${pick.stake.toLocaleString()}
                        </div>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div style={{ padding: "16px 14px", color: "var(--text-3)", fontSize: "0.78rem" }}>No bets placed yet</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
