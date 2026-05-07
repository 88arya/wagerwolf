"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";

const outcomeColor: Record<string, string> = {
  WIN: "#6fcf6f",
  LOSS: "#cf6f6f",
  PENDING: "#888",
};

export default function HistoryPage({ params }: PageProps<"/leagues/[leagueId]/history">) {
  const router = useRouter();
  const [leagueId, setLeagueId] = useState("");
  const [picks, setPicks] = useState<any[]>([]);
  const [league, setLeague] = useState<any>(null);

  useEffect(() => {
    async function load() {
      const id = localStorage.getItem("userId");
      if (!id) { router.push("/"); return; }

      const { leagueId } = await params;
      setLeagueId(leagueId);

      try {
        const [picksData, leagueData] = await Promise.all([
          api(`/picks?userId=${id}&leagueId=${leagueId}`),
          api(`/leagues/${leagueId}`),
        ]);
        setPicks(picksData);
        setLeague(leagueData);
      } catch {}
    }
    load();
  }, []);

  const wins = picks.filter((p) => p.outcome === "WIN").length;
  const losses = picks.filter((p) => p.outcome === "LOSS").length;
  const pending = picks.filter((p) => p.outcome === "PENDING").length;

  return (
    <>
      <nav className="nav">
        <strong>Playbook</strong>
        <Link href="/leagues">Leagues</Link>
        <Link href={`/leagues/${leagueId}`}>Dashboard</Link>
        <Link href={`/leagues/${leagueId}/bet`}>Bet</Link>
        <Link href={`/leagues/${leagueId}/leaderboard`}>Leaderboard</Link>
      </nav>

      <div className="page">
        <h1>{league?.name ?? "History"}</h1>
        <p className="subtitle">Your picks</p>

        {picks.length > 0 && (
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="row">
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: "1.5rem", fontWeight: 700, color: outcomeColor.WIN }}>{wins}</div>
                <div style={{ fontSize: "0.8rem", color: "#888" }}>Wins</div>
              </div>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: "1.5rem", fontWeight: 700, color: outcomeColor.LOSS }}>{losses}</div>
                <div style={{ fontSize: "0.8rem", color: "#888" }}>Losses</div>
              </div>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: "1.5rem", fontWeight: 700, color: outcomeColor.PENDING }}>{pending}</div>
                <div style={{ fontSize: "0.8rem", color: "#888" }}>Pending</div>
              </div>
            </div>
          </div>
        )}

        {picks.length === 0 && (
          <div className="card">
            <p style={{ color: "#888" }}>No picks yet.</p>
          </div>
        )}

        {picks.map((pick: any) => (
          <div key={pick.id} className="card">
            <div className="row">
              <div>
                <div style={{ marginBottom: 4 }}>
                  <strong>{pick.prop?.player?.name}</strong>
                  <span className="tag" style={{ marginLeft: 8 }}>
                    {pick.prop?.statType?.replaceAll("_", " ")}
                  </span>
                </div>
                <div style={{ color: "#888", fontSize: "0.85rem" }}>
                  {pick.direction} {pick.prop?.line} — stake ${pick.stake}
                  {pick.prop?.game?.week?.number != null && (
                    <span> · Week {pick.prop.game.week.number}</span>
                  )}
                </div>
              </div>
              <span style={{ fontWeight: 700, color: outcomeColor[pick.outcome] }}>
                {pick.outcome}
              </span>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
