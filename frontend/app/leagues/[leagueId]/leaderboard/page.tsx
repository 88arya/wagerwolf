"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";

export default function LeaderboardPage({ params }: PageProps<"/leagues/[leagueId]/leaderboard">) {
  const router = useRouter();
  const [leagueId, setLeagueId] = useState("");
  const [entries, setEntries] = useState<any[]>([]);
  const [league, setLeague] = useState<any>(null);
  const [myUserId, setMyUserId] = useState("");

  useEffect(() => {
    async function load() {
      const id = localStorage.getItem("userId");
      if (!id) { router.push("/"); return; }
      setMyUserId(id);

      const { leagueId } = await params;
      setLeagueId(leagueId);

      const [board, leagueData] = await Promise.all([
        api(`/leagues/${leagueId}/leaderboard`),
        api(`/leagues/${leagueId}`),
      ]);

      setEntries(board);
      setLeague(leagueData);
    }
    load();
  }, []);

  return (
    <>
      <nav className="nav">
        <strong>Playbook</strong>
        <Link href="/leagues">Leagues</Link>
        <Link href={`/leagues/${leagueId}`}>Dashboard</Link>
        <Link href={`/leagues/${leagueId}/bet`}>Bet</Link>
      </nav>

      <div className="page">
        <h1>{league?.name ?? "Leaderboard"}</h1>
        <p className="subtitle">Ranked by balance</p>

        {entries.map((entry: any) => (
          <div
            key={entry.userId}
            className="card"
            style={{ borderColor: entry.userId === myUserId ? "#444" : "#2a2a2a" }}
          >
            <div className="row">
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <span style={{ color: "#555", fontWeight: 700, fontSize: "1.2rem", width: 28 }}>
                  {entry.rank}
                </span>
                <div>
                  <strong>{entry.displayName}</strong>
                  {entry.userId === myUserId && (
                    <span className="badge" style={{ marginLeft: 8 }}>you</span>
                  )}
                </div>
              </div>
              <strong style={{ fontSize: "1.1rem" }}>${entry.balance}</strong>
            </div>
          </div>
        ))}

        {entries.length === 0 && (
          <div className="card">
            <p style={{ color: "#888" }}>No members yet.</p>
          </div>
        )}
      </div>
    </>
  );
}
