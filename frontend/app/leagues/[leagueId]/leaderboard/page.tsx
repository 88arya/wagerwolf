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
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      if (!localStorage.getItem("token")) { router.push("/"); return; }
      setMyUserId(localStorage.getItem("userId") ?? "");
      const { leagueId } = await params;
      setLeagueId(leagueId);
      try {
        const [board, leagueData] = await Promise.all([
          api(`/leagues/${leagueId}/leaderboard`),
          api(`/leagues/${leagueId}`),
        ]);
        setEntries(board);
        setLeague(leagueData);
      } catch {} finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  return (
    <>
      <nav className="nav">
        <div className="nav-logo">PLAY<span className="accent">BOOK</span></div>
        <Link href={`/leagues/${leagueId}`} style={{ fontSize: "0.82rem", color: "var(--text-2)" }}>‹ Home</Link>
      </nav>

      <div className="page">
        <div style={{ marginBottom: 20 }}>
          <h1>Leaderboard</h1>
          {league && (
            <p className="subtitle">{league.name} · {entries.length} player{entries.length !== 1 ? "s" : ""}</p>
          )}
        </div>

        {loading && (
          <div className="card">
            <div className="empty"><div className="empty-text">Loading standings…</div></div>
          </div>
        )}

        {!loading && entries.length === 0 && (
          <div className="card">
            <div className="empty">
              <div className="empty-icon">🏆</div>
              <div className="empty-text">No members yet</div>
            </div>
          </div>
        )}

        {entries.map((entry: any, i: number) => {
          const rank = i + 1;
          const rankClass = rank <= 3 ? `rank-${rank}` : "";
          const isMe = entry.userId === myUserId;
          const initials = (entry.displayName ?? "??").slice(0, 2).toUpperCase();

          return (
            <div
              key={entry.userId}
              className={`card ${rankClass}`}
              style={{
                marginBottom: 6,
                borderColor: isMe ? "var(--border-2)" : undefined,
                background: isMe ? "var(--surface-2)" : undefined,
              }}
            >
              <div className="row">
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <span className="rank-number" style={{ color: rank > 3 ? "var(--text-3)" : undefined }}>
                    {rank}
                  </span>
                  <div className="avatar">{initials}</div>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: "0.95rem" }}>
                      {entry.displayName}
                      {isMe && <span className="badge" style={{ marginLeft: 8 }}>you</span>}
                    </div>
                    {rank === 1 && (
                      <div style={{ fontSize: "0.7rem", color: "var(--gold)", fontWeight: 700, marginTop: 2 }}>
                        LEADING
                      </div>
                    )}
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  {(entry.wins > 0 || entry.losses > 0 || entry.ties > 0) && (
                    <div style={{ fontSize: "0.78rem", color: "var(--text-2)", marginBottom: 2 }}>
                      <span style={{ color: "var(--win)" }}>{entry.wins}W</span>
                      {" · "}
                      <span style={{ color: "var(--loss)" }}>{entry.losses}L</span>
                      {entry.ties > 0 && <span style={{ color: "var(--text-3)" }}> · {entry.ties}T</span>}
                    </div>
                  )}
                  <div className="leaderboard-balance">${entry.balance.toLocaleString()}</div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <BottomNav leagueId={leagueId} />
    </>
  );
}
