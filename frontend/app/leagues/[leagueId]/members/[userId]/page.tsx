"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import LeagueNav from "@/components/LeagueNav";

function fmtOdds(n: number) { return n > 0 ? `+${n}` : `${n}`; }
function fmtStatType(s: string) { return s.split("_").map((w: string) => w[0] + w.slice(1).toLowerCase()).join(" "); }

export default function MemberProfilePage({ params }: PageProps<"/leagues/[leagueId]/members/[userId]">) {
  const router = useRouter();
  const [leagueId, setLeagueId] = useState("");
  const [userId, setUserId] = useState("");
  const [stats, setStats] = useState<any>(null);
  const [isCreator, setIsCreator] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      if (!localStorage.getItem("token")) { router.push("/"); return; }
      const { leagueId: lid, userId: uid } = await params;
      setLeagueId(lid);
      setUserId(uid);
      try {
        const [data, leagueData] = await Promise.all([
          api(`/leagues/${lid}/members/${uid}/stats`),
          api(`/leagues/${lid}`),
        ]);
        setStats(data);
        const myId = localStorage.getItem("userId") ?? "";
        setIsCreator(leagueData?.creatorId === myId);
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
    ? { text: `${stats.streak}W streak`, color: "var(--win)", bg: "var(--win-bg)" }
    : stats.streak < 0
      ? { text: `${Math.abs(stats.streak)}L streak`, color: "var(--loss)", bg: "var(--loss-bg)" }
      : null;

  const roiColor = stats.roi > 0 ? "var(--win)" : stats.roi < 0 ? "var(--loss)" : "var(--text-2)";

  const rankColor = stats.rank === 1 ? "var(--gold)" : stats.rank === 2 ? "var(--silver)" : stats.rank === 3 ? "var(--bronze)" : "var(--text-3)";

  return (
    <>
      <LeagueNav leagueId={leagueId} />

      <div className="page" style={{ paddingBottom: 100 }}>
        {/* Profile header */}
        <div className="card" style={{ marginBottom: 10, textAlign: "center", padding: "22px 20px 18px" }}>
          <div style={{
            width: 60, height: 60, borderRadius: "50%",
            background: "var(--accent-dim)",
            border: `2.5px solid ${isMe ? "var(--accent)" : "var(--border-2)"}`,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: "1.3rem", fontWeight: 900, color: "var(--accent)",
            margin: "0 auto 12px",
          }}>
            {stats.displayName.slice(0, 2).toUpperCase()}
          </div>
          <div style={{ fontWeight: 900, fontSize: "1.15rem", color: "var(--text)", marginBottom: 6, lineHeight: 1.2 }}>
            {stats.displayName}
            {isMe && <span style={{ marginLeft: 8, fontSize: "0.68rem", color: "var(--accent)", fontWeight: 700 }}>YOU</span>}
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, flexWrap: "wrap" }}>
            <span style={{ color: rankColor, fontSize: "0.8rem", fontWeight: 700 }}>#{stats.rank} in league</span>
            {streakLabel && (
              <span style={{
                fontSize: "0.7rem", fontWeight: 800,
                color: streakLabel.color, background: streakLabel.bg,
                borderRadius: 4, padding: "2px 8px",
              }}>
                {streakLabel.text}
              </span>
            )}
          </div>
        </div>

        {/* Stats grid */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginBottom: 10 }}>
          {[
            { label: "Balance", value: `$${stats.balance.toLocaleString()}`, color: "var(--accent)" },
            { label: "Record", value: `${stats.wins}–${stats.losses}–${stats.ties}`, color: "var(--text)" },
            { label: "Win Rate", value: (stats.wonPicks + stats.lostPicks) > 0 ? `${Math.round(stats.wonPicks / (stats.wonPicks + stats.lostPicks) * 100)}%` : "—", color: "var(--text)" },
            { label: "ROI", value: stats.totalStaked > 0 ? `${stats.roi > 0 ? "+" : ""}${stats.roi}%` : "—", color: roiColor },
            { label: "Total Bets", value: String(stats.totalPicks), color: "var(--text)" },
            { label: "Profit", value: stats.totalProfit !== 0 ? `${stats.totalProfit > 0 ? "+" : ""}$${Math.abs(stats.totalProfit).toLocaleString()}` : "$0", color: stats.totalProfit > 0 ? "var(--win)" : stats.totalProfit < 0 ? "var(--loss)" : "var(--text-2)" },
          ].map(({ label, value, color }) => (
            <div key={label} className="card" style={{ margin: 0, textAlign: "center", padding: "12px 8px" }}>
              <div className="label" style={{ marginBottom: 4 }}>{label}</div>
              <div style={{ fontSize: "1.15rem", fontWeight: 900, color, fontVariantNumeric: "tabular-nums" }}>{value}</div>
            </div>
          ))}
        </div>

        {/* Prop performance */}
        {(stats.bestStatType || stats.worstStatType) && (
          <div className="card" style={{ marginBottom: 10, padding: "14px" }}>
            <div style={{ fontSize: "0.6rem", fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--text-3)", marginBottom: 12 }}>
              Prop Performance
            </div>
            {stats.bestStatType && (
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--win)", flexShrink: 0 }} />
                  <span style={{ fontSize: "0.82rem", fontWeight: 600 }}>{fmtStatType(stats.bestStatType.statType)}</span>
                  <span className="badge badge-green">Best</span>
                </div>
                <span style={{ fontWeight: 800, color: "var(--win)", fontVariantNumeric: "tabular-nums", fontSize: "0.88rem" }}>
                  +${stats.bestStatType.profit.toLocaleString()}
                </span>
              </div>
            )}
            {stats.worstStatType && stats.worstStatType.statType !== stats.bestStatType?.statType && (
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--loss)", flexShrink: 0 }} />
                  <span style={{ fontSize: "0.82rem", fontWeight: 600 }}>{fmtStatType(stats.worstStatType.statType)}</span>
                  <span className="badge badge-red">Worst</span>
                </div>
                <span style={{ fontWeight: 800, color: "var(--loss)", fontVariantNumeric: "tabular-nums", fontSize: "0.88rem" }}>
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
                    padding: "11px 14px",
                    borderBottom: idx < stats.recentPicks.length - 1 ? "1px solid var(--border)" : "none",
                  }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: "0.85rem", color: "var(--text)", marginBottom: 2 }}>
                        {pick.playerName}
                      </div>
                      <div style={{ fontSize: "0.68rem", color: "var(--text-3)" }}>
                        {pick.direction} {line} {fmtStatType(pick.statType)} · {fmtOdds(pick.odds)}
                      </div>
                    </div>
                    <div style={{ textAlign: "right", flexShrink: 0, marginLeft: 8 }}>
                      <div style={{ fontSize: "0.75rem", fontWeight: 800, color: outcomeColor }}>
                        {pick.outcome === "WIN" ? "WIN" : pick.outcome === "LOSS" ? "LOSS" : "—"}
                      </div>
                      <div style={{ fontSize: "0.68rem", color: "var(--text-3)", fontVariantNumeric: "tabular-nums" }}>
                        ${pick.stake.toLocaleString()}
                      </div>
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

    </>
  );
}
