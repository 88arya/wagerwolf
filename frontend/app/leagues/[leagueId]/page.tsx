"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";

export default function DashboardPage({ params }: PageProps<"/leagues/[leagueId]">) {
  const router = useRouter();
  const [leagueId, setLeagueId] = useState("");
  const [userId, setUserId] = useState("");
  const [membership, setMembership] = useState<any>(null);
  const [league, setLeague] = useState<any>(null);
  const [week, setWeek] = useState<any>(null);

  useEffect(() => {
    async function load() {
      const id = localStorage.getItem("userId");
      if (!id) { router.push("/"); return; }
      setUserId(id);

      const { leagueId } = await params;
      setLeagueId(leagueId);

      const [memberships, leagueData] = await Promise.all([
        api(`/memberships?userId=${id}`),
        api(`/leagues/${leagueId}`),
      ]);

      const m = memberships.find((m: any) => m.leagueId === leagueId);
      setMembership(m ?? null);
      setLeague(leagueData);

      try {
        const weeks = await api(`/weeks?current=true`);
        if (weeks?.length) setWeek(weeks[0]);
      } catch {}
    }
    load();
  }, []);

  if (!league) return <div className="page">Loading...</div>;

  return (
    <>
      <nav className="nav">
        <strong>Playbook</strong>
        <Link href="/leagues">Leagues</Link>
        <Link href={`/leagues/${leagueId}/bet`}>Bet</Link>
        <Link href={`/leagues/${leagueId}/history`}>History</Link>
        <Link href={`/leagues/${leagueId}/leaderboard`}>Leaderboard</Link>
      </nav>

      <div className="page">
        <h1>{league.name}</h1>
        <p className="subtitle">Dashboard</p>

        <div className="card">
          <div style={{ fontSize: "0.85rem", color: "#888", marginBottom: 6 }}>Your Balance</div>
          <div style={{ fontSize: "2.5rem", fontWeight: 700 }}>
            ${membership?.balance ?? "—"}
          </div>
        </div>

        {week ? (
          <div className="card">
            <div className="row" style={{ marginBottom: 16 }}>
              <strong>Week {week.number}</strong>
              <span className="badge">{week.resolved ? "Resolved" : "Active"}</span>
            </div>

            {week.games?.length ? (
              week.games.map((game: any) => (
                <div key={game.id} style={{ marginBottom: 16 }}>
                  <div style={{ color: "#888", fontSize: "0.85rem", marginBottom: 8 }}>
                    {game.homeTeam} vs {game.awayTeam}
                  </div>
                  {game.props?.map((prop: any) => (
                    <div key={prop.id} className="card" style={{ margin: "0 0 8px" }}>
                      <div className="row">
                        <div>
                          <strong>{prop.player?.name}</strong>
                          <div style={{ color: "#888", fontSize: "0.85rem" }}>
                            {prop.statType.replaceAll("_", " ")} — line {prop.line}
                          </div>
                        </div>
                        <span className="tag">
                          {prop.result !== null ? `Result: ${prop.result}` : "Open"}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              ))
            ) : (
              <p style={{ color: "#888" }}>No games this week yet.</p>
            )}
          </div>
        ) : (
          <div className="card">
            <p style={{ color: "#888" }}>No active week.</p>
          </div>
        )}

        <Link href={`/leagues/${leagueId}/bet`}>
          <button style={{ width: "100%", marginTop: 8 }}>Place Bets →</button>
        </Link>
      </div>
    </>
  );
}
