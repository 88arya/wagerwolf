"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import BottomNav from "@/components/BottomNav";

export default function BetPage({ params }: PageProps<"/leagues/[leagueId]/bet">) {
  const router = useRouter();
  const [leagueId, setLeagueId] = useState("");
  const [balance, setBalance] = useState<number | null>(null);
  const [props, setProps] = useState<any[]>([]);
  const [weekLocked, setWeekLocked] = useState(false);
  const [weekNumber, setWeekNumber] = useState<number | null>(null);
  const [picks, setPicks] = useState<Record<string, { direction: string; stake: string }>>({});
  const [submitted, setSubmitted] = useState<string[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    async function load() {
      if (!localStorage.getItem("token")) { router.push("/"); return; }
      const { leagueId } = await params;
      setLeagueId(leagueId);
      try {
        const [weeks, memberships] = await Promise.all([api("/weeks?current=true"), api("/memberships")]);
        const m = memberships.find((m: any) => m.leagueId === leagueId);
        if (m) setBalance(m.balance);
        if (weeks?.length) {
          setWeekLocked(weeks[0].locked || weeks[0].resolved);
          setWeekNumber(weeks[0].number);
          const [weekProps, existingPicks] = await Promise.all([
            api(`/props?weekId=${weeks[0].id}`),
            api(`/picks?leagueId=${leagueId}`),
          ]);
          setProps(weekProps);
          const weekPropIds = new Set(weekProps.map((p: any) => p.id));
          setSubmitted(existingPicks.filter((p: any) => weekPropIds.has(p.propId)).map((p: any) => p.propId));
        }
      } catch {}
    }
    load();
  }, []);

  function setPick(propId: string, field: "direction" | "stake", value: string) {
    setPicks((prev) => ({ ...prev, [propId]: { ...prev[propId], [field]: value } }));
  }

  async function placeBet(propId: string) {
    const pick = picks[propId];
    if (!pick?.direction || !pick?.stake) { setError("Select OVER or UNDER and enter a stake."); return; }
    if (Number(pick.stake) <= 0) { setError("Stake must be greater than 0."); return; }
    setError("");
    try {
      await api("/picks", {
        method: "POST",
        body: JSON.stringify({ leagueId, propId, direction: pick.direction, stake: Number(pick.stake) }),
      });
      setSubmitted((prev) => [...prev, propId]);
      setBalance((prev) => prev !== null ? prev - Number(pick.stake) : prev);
    } catch (err: any) {
      try { setError(JSON.parse(err.message).error); } catch { setError(err.message); }
    }
  }

  const remaining = props.filter((p) => !submitted.includes(p.id)).length;

  return (
    <>
      <nav className="nav">
        <div className="nav-logo">PLAY<span className="accent">BOOK</span></div>
        <Link href={`/leagues/${leagueId}`} style={{ fontSize: "0.82rem", color: "var(--text-2)" }}>‹ Home</Link>
      </nav>

      <div className="page">
        <div style={{ marginBottom: 20 }}>
          <h1>Place Bets</h1>
          {weekNumber && (
            <p className="subtitle">
              Week {weekNumber} · {weekLocked ? "Locked" : `${remaining} prop${remaining !== 1 ? "s" : ""} remaining`}
            </p>
          )}
        </div>

        {/* Balance + progress */}
        {balance !== null && (
          <div className="card" style={{ marginBottom: 10 }}>
            <div className="row">
              <div>
                <div className="label">Balance</div>
                <div style={{ fontSize: "1.6rem", fontWeight: 900, letterSpacing: "-0.03em", marginTop: 2 }}>
                  ${balance.toLocaleString()}
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div className="label">Submitted</div>
                <div style={{ fontSize: "1.6rem", fontWeight: 900, letterSpacing: "-0.03em", marginTop: 2, color: "var(--accent)" }}>
                  {submitted.length}/{props.length}
                </div>
              </div>
            </div>
          </div>
        )}

        {weekLocked && (
          <div style={{ background: "var(--loss-bg)", border: "1px solid rgba(255,68,102,0.3)", borderRadius: 10, padding: "12px 16px", marginBottom: 12 }}>
            <div style={{ color: "var(--loss)", fontWeight: 700, fontSize: "0.9rem" }}>🔒 Betting is locked for this week</div>
          </div>
        )}

        {error && <p className="error" style={{ marginBottom: 12 }}>{error}</p>}

        {props.length === 0 && (
          <div className="card">
            <div className="empty">
              <div className="empty-icon">🎯</div>
              <div className="empty-text">No props available this week</div>
            </div>
          </div>
        )}

        {props.map((prop: any) => {
          const done = submitted.includes(prop.id);
          const selected = picks[prop.id]?.direction;

          return (
            <div key={prop.id} className="card" style={{ marginBottom: 8, opacity: done ? 0.7 : 1 }}>
              {/* Player info */}
              <div className="row" style={{ marginBottom: 4 }}>
                <div>
                  <div style={{ fontWeight: 800, fontSize: "1.05rem" }}>{prop.player?.name}</div>
                  <div style={{ color: "var(--text-3)", fontSize: "0.75rem", marginTop: 2 }}>
                    {prop.player?.position} · {prop.player?.team}
                  </div>
                </div>
                <span className="tag">{prop.statType.replaceAll("_", " ")}</span>
              </div>

              {/* Line */}
              <div className="prop-line">{prop.line}</div>

              {/* Buttons */}
              {done ? (
                <div style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "center", padding: "8px 0", color: "var(--accent)", fontWeight: 700 }}>
                  <span>✓</span> <span>Bet submitted</span>
                </div>
              ) : weekLocked ? (
                <div style={{ textAlign: "center", color: "var(--text-3)", fontSize: "0.85rem", padding: "8px 0" }}>Locked</div>
              ) : (
                <>
                  <div className="row" style={{ marginBottom: 10 }}>
                    <button className={`over-btn${selected === "OVER" ? " active" : ""}`} onClick={() => setPick(prop.id, "direction", "OVER")}>OVER</button>
                    <button className={`under-btn${selected === "UNDER" ? " active" : ""}`} onClick={() => setPick(prop.id, "direction", "UNDER")}>UNDER</button>
                  </div>
                  {selected && (
                    <div className="row">
                      <input
                        type="number"
                        placeholder="Stake amount"
                        min="1"
                        max={balance ?? undefined}
                        value={picks[prop.id]?.stake ?? ""}
                        onChange={(e) => setPick(prop.id, "stake", e.target.value)}
                        style={{ fontSize: "1rem", fontWeight: 700 }}
                      />
                      <button
                        onClick={() => placeBet(prop.id)}
                        style={{ flexShrink: 0 }}
                      >
                        Bet {selected}
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          );
        })}
      </div>

      <BottomNav leagueId={leagueId} />
    </>
  );
}
