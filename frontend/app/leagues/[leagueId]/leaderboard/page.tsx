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

  const isCreator = league?.creatorId === myUserId;
  const hasWeekProfits = Object.keys(weekProfits).length > 0;
  const RANK_MEDALS = ["🥇", "🥈", "🥉"];

  return (
    <>
      <nav className="nav">
        <div className="nav-logo">PLAY<span className="accent">BOOK</span></div>
        <Link href={`/leagues/${leagueId}`}>‹ Home</Link>
      </nav>

      <div className="page">
        <div style={{ marginBottom: 16 }}>
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
              gridTemplateColumns: hasWeekProfits ? "30px 1fr 64px 68px 78px" : "30px 1fr 72px 84px",
              padding: "8px 14px",
              background: "var(--surface-2)",
              borderBottom: "1px solid var(--border)",
              gap: 8,
            }}>
              {["#", "Player", "W–L", ...(hasWeekProfits ? ["Wk P&L"] : []), "Balance"].map((h, i) => (
                <span key={String(h)} style={{
                  fontSize: "0.6rem", fontWeight: 800, letterSpacing: "0.1em",
                  textTransform: "uppercase", color: "var(--text-3)",
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
                <Link
                  key={entry.userId}
                  href={`/leagues/${leagueId}/members/${entry.userId}`}
                  style={{ display: "block", textDecoration: "none" }}
                >
                  <div style={{
                    display: "grid",
                    gridTemplateColumns: hasWeekProfits ? "30px 1fr 64px 68px 78px" : "30px 1fr 72px 84px",
                    padding: "11px 14px",
                    borderBottom: i < entries.length - 1 ? "1px solid var(--border)" : "none",
                    background: isMe ? "var(--accent-dim)" : rank === 1 ? "rgba(245,158,11,0.03)" : "transparent",
                    alignItems: "center",
                    gap: 8,
                    cursor: "pointer",
                    transition: "background 0.1s",
                  }}>
                    {/* Rank */}
                    <div style={{ textAlign: "center" }}>
                      {rank <= 3 ? (
                        <span style={{ fontSize: "0.95rem" }}>{RANK_MEDALS[rank - 1]}</span>
                      ) : (
                        <span style={{ fontWeight: 900, fontSize: "0.88rem", color: rankColor }}>{rank}</span>
                      )}
                    </div>

                    {/* Player */}
                    <div style={{ display: "flex", alignItems: "center", gap: 9, minWidth: 0 }}>
                      <div className="avatar" style={{
                        width: 32, height: 32, fontSize: "0.68rem", flexShrink: 0,
                        ...(rank === 1 ? { borderColor: "var(--gold)", color: "var(--gold)", background: "rgba(245,158,11,0.1)" } : {}),
                        ...(rank === 2 ? { borderColor: "var(--silver)", color: "var(--silver)", background: "rgba(148,163,184,0.08)" } : {}),
                        ...(rank === 3 ? { borderColor: "var(--bronze)", color: "var(--bronze)", background: "rgba(205,127,50,0.08)" } : {}),
                      }}>
                        {initials}
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <div style={{
                          fontWeight: isMe ? 800 : 600,
                          fontSize: "0.85rem",
                          color: isMe ? "var(--accent)" : "var(--text)",
                          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                        }}>
                          {entry.displayName}
                          {isMe && <span style={{ fontSize: "0.6rem", color: "var(--accent)", marginLeft: 6, fontWeight: 700 }}>YOU</span>}
                        </div>
                        {rank === 1 && (
                          <div style={{ fontSize: "0.58rem", color: "var(--gold)", fontWeight: 700, letterSpacing: "0.08em" }}>LEADING</div>
                        )}
                      </div>
                    </div>

                    {/* W-L */}
                    <div style={{ textAlign: "center", fontSize: "0.78rem", fontWeight: 600 }}>
                      <span style={{ color: "var(--win)" }}>{entry.wins}</span>
                      <span style={{ color: "var(--text-3)" }}>–</span>
                      <span style={{ color: "var(--loss)" }}>{entry.losses}</span>
                      {entry.ties > 0 && <span style={{ color: "var(--text-3)" }}>–{entry.ties}</span>}
                    </div>

                    {/* Weekly P&L */}
                    {hasWeekProfits && (
                      <div style={{ textAlign: "center", fontWeight: 700, fontSize: "0.8rem", fontVariantNumeric: "tabular-nums" }}>
                        {wkProfit == null
                          ? <span style={{ color: "var(--text-3)" }}>—</span>
                          : <span style={{ color: wkProfit >= 0 ? "var(--win)" : "var(--loss)" }}>
                              {wkProfit >= 0 ? "+" : ""}${Math.abs(wkProfit).toLocaleString()}
                            </span>
                        }
                      </div>
                    )}

                    {/* Balance */}
                    <div style={{ textAlign: "right", fontWeight: 800, fontSize: "0.88rem", fontVariantNumeric: "tabular-nums", color: "var(--text)" }}>
                      ${entry.balance.toLocaleString()}
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>

      <BottomNav leagueId={leagueId} isCreator={isCreator} />
    </>
  );
}
