"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";

export default function BetPage({ params }: PageProps<"/leagues/[leagueId]/bet">) {
  const router = useRouter();
  const [leagueId, setLeagueId] = useState("");
  const [userId, setUserId] = useState("");
  const [balance, setBalance] = useState<number | null>(null);
  const [props, setProps] = useState<any[]>([]);
  const [picks, setPicks] = useState<Record<string, { direction: string; stake: string }>>({});
  const [submitted, setSubmitted] = useState<string[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    async function load() {
      const id = localStorage.getItem("userId");
      if (!id) { router.push("/"); return; }
      setUserId(id);

      const { leagueId } = await params;
      setLeagueId(leagueId);

      try {
        const [weeks, memberships] = await Promise.all([
          api(`/weeks?current=true`),
          api(`/memberships?userId=${id}`),
        ]);

        const m = memberships.find((m: any) => m.leagueId === leagueId);
        if (m) setBalance(m.balance);

        if (weeks?.length) {
          const [weekProps, existingPicks] = await Promise.all([
            api(`/props?weekId=${weeks[0].id}`),
            api(`/picks?userId=${id}&leagueId=${leagueId}`),
          ]);
          setProps(weekProps);
          const weekPropIds = new Set(weekProps.map((p: any) => p.id));
          const alreadyBet = existingPicks
            .filter((pick: any) => weekPropIds.has(pick.propId))
            .map((pick: any) => pick.propId);
          setSubmitted(alreadyBet);
        }
      } catch {}
    }
    load();
  }, []);

  function setPick(propId: string, field: "direction" | "stake", value: string) {
    setPicks((prev) => ({
      ...prev,
      [propId]: { ...prev[propId], [field]: value },
    }));
  }

  async function placeBet(propId: string) {
    const pick = picks[propId];
    if (!pick?.direction || !pick?.stake) {
      setError("Select OVER or UNDER and enter a stake.");
      return;
    }
    if (Number(pick.stake) <= 0) {
      setError("Stake must be greater than 0.");
      return;
    }
    setError("");
    try {
      await api("/picks", {
        method: "POST",
        body: JSON.stringify({
          userId,
          leagueId,
          propId,
          direction: pick.direction,
          stake: Number(pick.stake),
        }),
      });
      setSubmitted((prev) => [...prev, propId]);
      setBalance((prev) => prev !== null ? prev - Number(pick.stake) : prev);
    } catch (err: any) {
      setError(err.message);
    }
  }

  return (
    <>
      <nav className="nav">
        <strong>Playbook</strong>
        <Link href="/leagues">Leagues</Link>
        <Link href={`/leagues/${leagueId}`}>Dashboard</Link>
        <Link href={`/leagues/${leagueId}/history`}>History</Link>
        <Link href={`/leagues/${leagueId}/leaderboard`}>Leaderboard</Link>
      </nav>

      <div className="page">
        <h1>Place Bets</h1>
        <p className="subtitle">Pick OVER or UNDER for each prop</p>

        {balance !== null && (
          <div className="card" style={{ marginBottom: 16 }}>
            <div style={{ fontSize: "0.85rem", color: "#888", marginBottom: 4 }}>Your Balance</div>
            <div style={{ fontSize: "1.8rem", fontWeight: 700 }}>${balance}</div>
          </div>
        )}

        {error && <p className="error" style={{ marginBottom: 16 }}>{error}</p>}

        {props.length === 0 && (
          <div className="card">
            <p style={{ color: "#888" }}>No props available this week.</p>
          </div>
        )}

        {props.map((prop: any) => {
          const done = submitted.includes(prop.id);
          return (
            <div key={prop.id} className="card">
              <div style={{ marginBottom: 12 }}>
                <strong>{prop.player?.name}</strong>
                <span className="tag" style={{ marginLeft: 8 }}>
                  {prop.statType.replaceAll("_", " ")}
                </span>
              </div>
              <div style={{ fontSize: "1.4rem", fontWeight: 700, marginBottom: 16 }}>
                Line: {prop.line}
              </div>

              {done ? (
                <div style={{ color: "#6fcf6f" }}>✓ Bet placed</div>
              ) : (
                <>
                  <div className="row" style={{ marginBottom: 12 }}>
                    <button
                      className={`over-btn ${picks[prop.id]?.direction === "OVER" ? "active" : ""}`}
                      onClick={() => setPick(prop.id, "direction", "OVER")}
                    >
                      OVER
                    </button>
                    <button
                      className={`under-btn ${picks[prop.id]?.direction === "UNDER" ? "active" : ""}`}
                      onClick={() => setPick(prop.id, "direction", "UNDER")}
                    >
                      UNDER
                    </button>
                  </div>
                  <div className="row">
                    <input
                      type="number"
                      placeholder="Stake"
                      min="1"
                      value={picks[prop.id]?.stake ?? ""}
                      onChange={(e) => setPick(prop.id, "stake", e.target.value)}
                    />
                    <button onClick={() => placeBet(prop.id)}>Bet</button>
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}
