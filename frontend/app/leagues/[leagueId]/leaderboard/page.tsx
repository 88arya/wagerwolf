"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import BottomNav from "@/components/BottomNav";

export default function LeaderboardPage({ params }: PageProps<"/leagues/[leagueId]/leaderboard">) {
  const router = useRouter();
  const [leagueId, setLeagueId] = useState("");
  const [entries, setEntries] = useState<any[]>([]);
  const [league, setLeague] = useState<any>(null);
  const [myUserId, setMyUserId] = useState("");
  const [weekProfits, setWeekProfits] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      if (!localStorage.getItem("token")) { router.push("/"); return; }
      const uid = localStorage.getItem("userId") ?? "";
      setMyUserId(uid);
      const { leagueId } = await params;
      setLeagueId(leagueId);
      try {
        const [board, leagueData, weeks] = await Promise.all([
          api(`/leagues/${leagueId}/leaderboard`),
          api(`/leagues/${leagueId}`),
          api(`/weeks?current=true&leagueId=${leagueId}`),
        ]);
        setEntries(board);
        setLeague(leagueData);

        if (weeks?.[0]) {
          const matchups = await api(`/leagues/${leagueId}/matchups?weekNumber=${weeks[0].number}`);
          const profits: Record<string, number> = {};
          for (const m of matchups) {
            if (m.homeProfit != null) profits[m.homeUserId] = m.homeProfit;
            if (m.awayProfit != null) profits[m.awayUserId] = m.awayProfit;
          }
          setWeekProfits(profits);
        }
      } catch {} finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const hasWeekProfits = Object.keys(weekProfits).length > 0;

  return (
    <>
      <nav className="nav">
        <div className="nav-logo">PLAY<span className="accent">BOOK</span></div>
        <Link href={`/leagues/${leagueId}`}>‹ Home</Link>
      </nav>

      <div className="page">
        <div style={{ marginBottom: 20 }}>
          <h1>Standings</h1>
          {league && (
            <p className="subtitle">{league.name} · {entries.length} player{entries.length !== 1 ? "s" : ""}</p>
          )}
        </div>

        {loading && <div className="loading" style={{ height: "20vh" }}>Loading…</div>}

        {!loading && entries.length === 0 && (
          <div className="card">
            <div className="empty">
              <div className="empty-icon">🏆</div>
              <div className="empty-text">No members yet</div>
            </div>
          </div>
        )}

        {!loading && entries.length > 0 && (
          <div className="card" style={{ padding: 0, overflow: "hidden" }}>
            {/* Header */}
            <div style={{
              display: "grid",
              gridTemplateColumns: hasWeekProfits ? "32px 1fr 70px 72px 80px" : "32px 1fr 80px 90px",
              padding: "9px 16px",
              background: "var(--navy)",
              gap: 8,
            }}>
              {["#", "Player", "W–L", hasWeekProfits ? "Wk P&L" : null, "Balance"].filter(Boolean).map((h, i) => (
                <span key={String(h)} style={{
                  fontSize: "0.63rem", fontWeight: 800, letterSpacing: "0.1em",
                  textTransform: "uppercase", color: "rgba(255,255,255,0.45)",
                  textAlign: i >= 2 ? "center" : "left",
                }}>{h}</span>
              ))}
            </div>

            {entries.map((entry: any, i: number) => {
              const rank = i + 1;
              const isMe = entry.userId === myUserId;
              const rankColor = rank === 1 ? "var(--gold)" : rank === 2 ? "var(--silver)" : rank === 3 ? "var(--bronze)" : "var(--text-3)";
              const initials = (entry.displayName ?? "??").slice(0, 2).toUpperCase();
              const wkProfit = weekProfits[entry.userId];

              return (
                <div
                  key={entry.userId}
                  style={{
                    display: "grid",
                    gridTemplateColumns: hasWeekProfits ? "32px 1fr 70px 72px 80px" : "32px 1fr 80px 90px",
                    padding: "12px 16px",
                    borderBottom: i < entries.length - 1 ? "1px solid var(--border)" : "none",
                    background: isMe ? "var(--accent-dim)" : rank === 1 ? "rgba(200,150,12,0.04)" : "transparent",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  <span style={{ fontWeight: 900, fontSize: "0.95rem", color: rankColor, textAlign: "center" }}>
                    {rank <= 3 ? ["🥇","🥈","🥉"][rank-1] : rank}
                  </span>

                  <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                    <div className="avatar" style={{
                      width: 34, height: 34, fontSize: "0.72rem", flexShrink: 0,
                      ...(rank === 1 ? { borderColor: "var(--gold)", color: "var(--gold)", background: "rgba(200,150,12,0.1)" } : {}),
                      ...(rank === 2 ? { borderColor: "var(--silver)", color: "var(--silver)", background: "rgba(107,122,148,0.1)" } : {}),
                      ...(rank === 3 ? { borderColor: "var(--bronze)", color: "var(--bronze)", background: "rgba(139,101,82,0.1)" } : {}),
                    }}>
                      {initials}
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: isMe ? 800 : 600, fontSize: "0.88rem", color: isMe ? "var(--accent)" : "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {entry.displayName}
                        {isMe && <span style={{ fontSize: "0.65rem", color: "var(--accent)", marginLeft: 6, fontWeight: 700 }}>YOU</span>}
                      </div>
                      {rank === 1 && (
                        <div style={{ fontSize: "0.62rem", color: "var(--gold)", fontWeight: 700, letterSpacing: "0.08em" }}>LEADING</div>
                      )}
                    </div>
                  </div>

                  <div style={{ textAlign: "center", fontSize: "0.8rem", fontWeight: 600, color: "var(--text-2)" }}>
                    <span style={{ color: "var(--win)" }}>{entry.wins}</span>
                    <span style={{ color: "var(--text-3)" }}>–</span>
                    <span style={{ color: "var(--loss)" }}>{entry.losses}</span>
                    {entry.ties > 0 && <span style={{ color: "var(--text-3)" }}>–{entry.ties}</span>}
                  </div>

                  {hasWeekProfits && (
                    <div style={{ textAlign: "center", fontWeight: 700, fontSize: "0.82rem", fontVariantNumeric: "tabular-nums" }}>
                      {wkProfit == null
                        ? <span style={{ color: "var(--text-3)" }}>—</span>
                        : <span style={{ color: wkProfit >= 0 ? "var(--win)" : "var(--loss)" }}>
                            {wkProfit >= 0 ? "+" : ""}${Math.abs(wkProfit).toLocaleString()}
                          </span>
                      }
                    </div>
                  )}

                  <div style={{ textAlign: "right", fontWeight: 800, fontSize: "0.9rem", fontVariantNumeric: "tabular-nums", color: "var(--text)" }}>
                    ${entry.balance.toLocaleString()}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <BottomNav leagueId={leagueId} />
    </>
  );
}
