"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import BottomNav from "@/components/BottomNav";
import BetSlip, { addToSlip, getBetSlip } from "@/components/BetSlip";

function fmtOdds(american: number): string {
  return american > 0 ? `+${american}` : `${american}`;
}

export default function BetPage({ params }: PageProps<"/leagues/[leagueId]/bet">) {
  const router = useRouter();
  const [leagueId, setLeagueId] = useState("");
  const [balance, setBalance] = useState<number | null>(null);
  const [props, setProps] = useState<any[]>([]);
  const [gameLines, setGameLines] = useState<any[]>([]);
  const [weekLocked, setWeekLocked] = useState(false);
  const [weekNumber, setWeekNumber] = useState<number | null>(null);
  const [tab, setTab] = useState<"props" | "lines">("props");

  // Prop straight bets
  const [picks, setPicks] = useState<Record<string, { direction: string; stake: string }>>({});
  const [submittedProps, setSubmittedProps] = useState<string[]>([]);

  // Game line straight bets
  const [lineStakes, setLineStakes] = useState<Record<string, string>>({});
  const [submittedLines, setSubmittedLines] = useState<string[]>([]);

  // Slip state (to show "In Slip" indicator)
  const [slipIds, setSlipIds] = useState<Set<string>>(new Set());

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
          const week = weeks[0];
          setWeekLocked(week.locked || week.resolved);
          setWeekNumber(week.number);

          const [existingPicks, existingGamePicks] = await Promise.all([
            api(`/picks?leagueId=${leagueId}`),
            api(`/gamepicks?leagueId=${leagueId}`),
          ]);

          const allProps: any[] = [];
          const allLines: any[] = [];
          for (const game of week.games ?? []) {
            for (const prop of game.props ?? []) {
              allProps.push({ ...prop, game });
            }
            for (const line of game.gameLines ?? []) {
              allLines.push({ ...line, game });
            }
          }
          setProps(allProps);
          setGameLines(allLines);

          const propIds = new Set(allProps.map((p: any) => p.id));
          const lineIds = new Set(allLines.map((l: any) => l.id));
          setSubmittedProps(existingPicks.filter((p: any) => propIds.has(p.propId)).map((p: any) => p.propId));
          setSubmittedLines(existingGamePicks.filter((p: any) => lineIds.has(p.gameLineId)).map((p: any) => p.gameLineId));
        }
      } catch {}

      const slip = getBetSlip();
      setSlipIds(new Set(slip.map((l) => `${l.id}:${l.direction ?? ""}`)));
    }
    load();

    const refresh = () => {
      const slip = getBetSlip();
      setSlipIds(new Set(slip.map((l) => `${l.id}:${l.direction ?? ""}`)));
    };
    window.addEventListener("betslip-update", refresh);
    return () => window.removeEventListener("betslip-update", refresh);
  }, []);

  function setPick(propId: string, field: "direction" | "stake", value: string) {
    setPicks((prev) => ({ ...prev, [propId]: { ...prev[propId], [field]: value } }));
  }

  async function placeBet(propId: string, prop: any) {
    const pick = picks[propId];
    if (!pick?.direction || !pick?.stake) { setError("Select OVER or UNDER and enter a stake."); return; }
    if (Number(pick.stake) <= 0) { setError("Stake must be greater than 0."); return; }
    setError("");
    try {
      await api("/picks", {
        method: "POST",
        body: JSON.stringify({ leagueId, propId, direction: pick.direction, stake: Number(pick.stake) }),
      });
      setSubmittedProps((prev) => [...prev, propId]);
      setBalance((prev) => prev !== null ? prev - Number(pick.stake) : prev);
    } catch (err: any) {
      try { setError(JSON.parse(err.message).error); } catch { setError(err.message); }
    }
  }

  async function placeLineBet(gameLineId: string) {
    const stakeStr = lineStakes[gameLineId];
    if (!stakeStr || Number(stakeStr) <= 0) { setError("Enter a valid stake."); return; }
    setError("");
    try {
      await api("/gamepicks", {
        method: "POST",
        body: JSON.stringify({ leagueId, gameLineId, stake: Number(stakeStr) }),
      });
      setSubmittedLines((prev) => [...prev, gameLineId]);
      setBalance((prev) => prev !== null ? prev - Number(stakeStr) : prev);
    } catch (err: any) {
      try { setError(JSON.parse(err.message).error); } catch { setError(err.message); }
    }
  }

  function addPropToSlip(prop: any, direction: "OVER" | "UNDER") {
    const ok = addToSlip({
      type: "prop",
      id: prop.id,
      direction,
      label: `${prop.player?.name} ${direction} ${prop.line} ${prop.statType.replaceAll("_", " ")}`,
      odds: prop.odds ?? -110,
    });
    if (!ok) setError("Already in slip");
    else setError("");
  }

  function addLineToSlip(line: any) {
    const ok = addToSlip({
      type: "gameline",
      id: line.id,
      label: line.label,
      odds: line.odds,
    });
    if (!ok) setError("Already in slip");
    else setError("");
  }

  const remaining = props.filter((p) => !submittedProps.includes(p.id)).length;

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
              Week {weekNumber} · {weekLocked ? "Locked" : `${remaining} prop${remaining !== 1 ? "s" : ""} available`}
            </p>
          )}
        </div>

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
                  {submittedProps.length + submittedLines.length} bets
                </div>
              </div>
            </div>
          </div>
        )}

        {weekLocked && (
          <div style={{ background: "var(--loss-bg)", border: "1px solid rgba(255,68,102,0.3)", borderRadius: 10, padding: "12px 16px", marginBottom: 12 }}>
            <div style={{ color: "var(--loss)", fontWeight: 700, fontSize: "0.9rem" }}>Betting is locked for this week</div>
          </div>
        )}

        {error && <p className="error" style={{ marginBottom: 12 }}>{error}</p>}

        {/* Tab toggle */}
        <div style={{ display: "flex", background: "var(--surface)", borderRadius: 8, padding: 4, marginBottom: 16 }}>
          {(["props", "lines"] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)} style={{
              flex: 1, padding: "8px 0",
              background: tab === t ? "var(--surface-3)" : "transparent",
              color: tab === t ? "var(--text)" : "var(--text-2)",
              border: "none", borderRadius: 6,
              fontWeight: tab === t ? 700 : 500, fontSize: "0.82rem",
              boxShadow: "none", letterSpacing: "0.03em", textTransform: "capitalize",
            }}>
              {t === "props" ? `Props (${props.length})` : `Game Lines (${gameLines.length})`}
            </button>
          ))}
        </div>

        {/* Props tab */}
        {tab === "props" && (
          <>
            {props.length === 0 && (
              <div className="card">
                <div className="empty">
                  <div className="empty-icon">🎯</div>
                  <div className="empty-text">No props available this week</div>
                </div>
              </div>
            )}

            {props.map((prop: any) => {
              const done = submittedProps.includes(prop.id);
              const selected = picks[prop.id]?.direction;
              const inSlipOver = slipIds.has(`${prop.id}:OVER`);
              const inSlipUnder = slipIds.has(`${prop.id}:UNDER`);

              return (
                <div key={prop.id} className="card" style={{ marginBottom: 8, opacity: done ? 0.7 : 1 }}>
                  <div className="row" style={{ marginBottom: 4 }}>
                    <div>
                      <div style={{ fontWeight: 800, fontSize: "1.05rem" }}>{prop.player?.name}</div>
                      <div style={{ color: "var(--text-3)", fontSize: "0.75rem", marginTop: 2 }}>
                        {prop.player?.position} · {prop.player?.team} · {prop.game?.homeTeam} vs {prop.game?.awayTeam}
                      </div>
                    </div>
                    <span className="tag">{prop.statType.replaceAll("_", " ")}</span>
                  </div>

                  <div className="prop-line">{prop.line} <span style={{ fontSize: "0.75rem", fontWeight: 500, color: "var(--text-3)", marginLeft: 4 }}>{fmtOdds(prop.odds ?? -110)}</span></div>

                  {done ? (
                    <div style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "center", padding: "8px 0", color: "var(--accent)", fontWeight: 700 }}>
                      ✓ Bet submitted
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
                        <div className="row" style={{ marginBottom: 8 }}>
                          <input
                            type="number"
                            placeholder="Stake"
                            min="1"
                            max={balance ?? undefined}
                            value={picks[prop.id]?.stake ?? ""}
                            onChange={(e) => setPick(prop.id, "stake", e.target.value)}
                            style={{ fontSize: "1rem", fontWeight: 700 }}
                          />
                          <button onClick={() => placeBet(prop.id, prop)} style={{ flexShrink: 0 }}>
                            Bet {selected}
                          </button>
                        </div>
                      )}

                      <div style={{ display: "flex", gap: 6 }}>
                        <button
                          className="secondary"
                          style={{ flex: 1, fontSize: "0.75rem", padding: "6px 0", opacity: inSlipOver ? 0.5 : 1 }}
                          onClick={() => addPropToSlip(prop, "OVER")}
                          disabled={inSlipOver}
                        >
                          {inSlipOver ? "✓ In Slip" : "+ Slip OVER"}
                        </button>
                        <button
                          className="secondary"
                          style={{ flex: 1, fontSize: "0.75rem", padding: "6px 0", opacity: inSlipUnder ? 0.5 : 1 }}
                          onClick={() => addPropToSlip(prop, "UNDER")}
                          disabled={inSlipUnder}
                        >
                          {inSlipUnder ? "✓ In Slip" : "+ Slip UNDER"}
                        </button>
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </>
        )}

        {/* Game Lines tab */}
        {tab === "lines" && (
          <>
            {gameLines.length === 0 && (
              <div className="card">
                <div className="empty">
                  <div className="empty-icon">📊</div>
                  <div className="empty-text">No game lines available this week</div>
                </div>
              </div>
            )}

            {/* Group by game */}
            {Array.from(
              gameLines.reduce((map, line) => {
                const key = line.gameId;
                if (!map.has(key)) map.set(key, { game: line.game, lines: [] });
                map.get(key).lines.push(line);
                return map;
              }, new Map<string, any>()).values()
            ).map(({ game, lines }: any) => (
              <div key={game.id} className="card" style={{ marginBottom: 10 }}>
                <div style={{ fontWeight: 800, fontSize: "0.9rem", marginBottom: 12, color: "var(--text-2)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                  {game.homeTeam} vs {game.awayTeam}
                </div>
                {lines.map((line: any) => {
                  const done = submittedLines.includes(line.id);
                  const inSlip = slipIds.has(`${line.id}:`);

                  return (
                    <div key={line.id} style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "10px 0",
                      borderBottom: "1px solid var(--border)",
                    }}>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: "0.9rem" }}>{line.label}</div>
                        <div style={{ fontSize: "0.75rem", color: "var(--text-2)", marginTop: 2 }}>
                          {fmtOdds(line.odds)}
                          {line.line != null && <span style={{ color: "var(--text-3)", marginLeft: 8 }}>line {line.line}</span>}
                        </div>
                      </div>
                      {done ? (
                        <span style={{ color: "var(--accent)", fontWeight: 700, fontSize: "0.85rem" }}>✓ Bet</span>
                      ) : weekLocked ? (
                        <span style={{ color: "var(--text-3)", fontSize: "0.82rem" }}>Locked</span>
                      ) : (
                        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                          <input
                            type="number"
                            placeholder="Stake"
                            min="1"
                            value={lineStakes[line.id] ?? ""}
                            onChange={(e) => setLineStakes((prev) => ({ ...prev, [line.id]: e.target.value }))}
                            style={{ width: 80, fontSize: "0.85rem", padding: "6px 8px" }}
                          />
                          <button style={{ fontSize: "0.8rem", padding: "6px 10px" }} onClick={() => placeLineBet(line.id)}>
                            Bet
                          </button>
                          <button
                            className="secondary"
                            style={{ fontSize: "0.75rem", padding: "6px 8px", opacity: inSlip ? 0.5 : 1 }}
                            onClick={() => addLineToSlip(line)}
                            disabled={inSlip}
                          >
                            {inSlip ? "✓" : "+"}
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </>
        )}
      </div>

      <BetSlip leagueId={leagueId} />
      <BottomNav leagueId={leagueId} />
    </>
  );
}
