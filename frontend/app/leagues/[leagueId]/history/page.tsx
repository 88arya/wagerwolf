"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import BottomNav from "@/components/BottomNav";

export default function HistoryPage({ params }: PageProps<"/leagues/[leagueId]/history">) {
  const router = useRouter();
  const [leagueId, setLeagueId] = useState("");
  const [picks, setPicks] = useState<any[]>([]);
  const [league, setLeague] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      if (!localStorage.getItem("token")) { router.push("/"); return; }
      const { leagueId } = await params;
      setLeagueId(leagueId);
      try {
        const [picksData, leagueData] = await Promise.all([
          api(`/picks?leagueId=${leagueId}`),
          api(`/leagues/${leagueId}`),
        ]);
        setPicks(picksData);
        setLeague(leagueData);
      } catch {} finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const wins = picks.filter((p) => p.outcome === "WIN").length;
  const losses = picks.filter((p) => p.outcome === "LOSS").length;
  const pending = picks.filter((p) => p.outcome === "PENDING").length;

  const netReturn = picks.reduce((sum: number, p: any) => {
    if (p.outcome === "WIN") return sum + Number(p.stake);
    if (p.outcome === "LOSS") return sum - Number(p.stake);
    return sum;
  }, 0);

  function outcomeCardClass(outcome: string) {
    if (outcome === "WIN") return "card card-win";
    if (outcome === "LOSS") return "card card-loss";
    return "card";
  }

  function outcomeTextClass(outcome: string) {
    if (outcome === "WIN") return "text-win";
    if (outcome === "LOSS") return "text-loss";
    return "text-pending";
  }

  return (
    <>
      <nav className="nav">
        <div className="nav-logo">PLAY<span className="accent">BOOK</span></div>
        <Link href={`/leagues/${leagueId}`} style={{ fontSize: "0.82rem", color: "var(--text-2)" }}>‹ Home</Link>
      </nav>

      <div className="page">
        <div style={{ marginBottom: 20 }}>
          <h1>History</h1>
          {league && <p className="subtitle">{league.name} · {picks.length} pick{picks.length !== 1 ? "s" : ""}</p>}
        </div>

        {loading && (
          <div className="card">
            <div className="empty"><div className="empty-text">Loading picks…</div></div>
          </div>
        )}

        {!loading && picks.length > 0 && (
          <>
            <div className="stat-grid" style={{ marginBottom: 16 }}>
              <div className="stat-cell">
                <div className="stat-cell-value text-win">{wins}</div>
                <div className="stat-cell-label">Wins</div>
              </div>
              <div className="stat-cell">
                <div className="stat-cell-value text-loss">{losses}</div>
                <div className="stat-cell-label">Losses</div>
              </div>
              <div className="stat-cell">
                <div className="stat-cell-value text-pending">{pending}</div>
                <div className="stat-cell-label">Pending</div>
              </div>
            </div>

            {(wins + losses) > 0 && (
              <div className="card" style={{ marginBottom: 16 }}>
                <div className="row">
                  <div>
                    <div className="label">Win Rate</div>
                    <div style={{ fontSize: "1.4rem", fontWeight: 900, letterSpacing: "-0.02em", marginTop: 2 }}>
                      {Math.round((wins / (wins + losses)) * 100)}%
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div className="label">Net Return</div>
                    <div style={{
                      fontSize: "1.4rem", fontWeight: 900, letterSpacing: "-0.02em", marginTop: 2,
                      color: netReturn >= 0 ? "var(--win)" : "var(--loss)",
                    }}>
                      {netReturn >= 0 ? "+" : ""}${netReturn.toLocaleString()}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {!loading && picks.length === 0 && (
          <div className="card">
            <div className="empty">
              <div className="empty-icon">📋</div>
              <div className="empty-text">No picks yet. Place some bets!</div>
            </div>
          </div>
        )}

        {picks.map((pick: any) => (
          <div key={pick.id} className={outcomeCardClass(pick.outcome)} style={{ marginBottom: 8 }}>
            <div className="row" style={{ marginBottom: 6 }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: "0.95rem" }}>{pick.prop?.player?.name}</div>
                <div style={{ color: "var(--text-3)", fontSize: "0.75rem", marginTop: 2 }}>
                  {pick.prop?.player?.position} · {pick.prop?.player?.team}
                </div>
              </div>
              <span className={`${outcomeTextClass(pick.outcome)}`} style={{ fontWeight: 800, fontSize: "0.9rem", letterSpacing: "0.04em" }}>
                {pick.outcome}
              </span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span className="tag">{pick.prop?.statType?.replaceAll("_", " ")}</span>
              <span className="tag">{pick.direction} {pick.prop?.line}</span>
              <span style={{ color: "var(--text-2)", fontSize: "0.78rem" }}>stake ${pick.stake}</span>
              {pick.prop?.game?.week?.number != null && (
                <span style={{ color: "var(--text-3)", fontSize: "0.78rem" }}>· Wk {pick.prop.game.week.number}</span>
              )}
            </div>
          </div>
        ))}
      </div>

      <BottomNav leagueId={leagueId} />
    </>
  );
}
