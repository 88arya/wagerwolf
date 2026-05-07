"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import BottomNav from "@/components/BottomNav";

export default function DashboardPage({ params }: PageProps<"/leagues/[leagueId]">) {
  const router = useRouter();
  const [leagueId, setLeagueId] = useState("");
  const [userId, setUserId] = useState("");
  const [membership, setMembership] = useState<any>(null);
  const [league, setLeague] = useState<any>(null);
  const [week, setWeek] = useState<any>(null);
  const [members, setMembers] = useState<any[]>([]);
  const [showMembers, setShowMembers] = useState(false);
  const [copied, setCopied] = useState(false);
  const [matchup, setMatchup] = useState<any>(null);

  useEffect(() => {
    async function load() {
      if (!localStorage.getItem("token")) { router.push("/"); return; }
      const id = localStorage.getItem("userId")!;
      setUserId(id);
      const { leagueId } = await params;
      setLeagueId(leagueId);

      const [memberships, leagueData] = await Promise.all([
        api("/memberships"),
        api(`/leagues/${leagueId}`),
      ]);
      setMembership(memberships.find((m: any) => m.leagueId === leagueId) ?? null);
      setLeague(leagueData);

      try {
        const [weeks, board] = await Promise.all([
          api("/weeks?current=true"),
          api(`/leagues/${leagueId}/leaderboard`),
        ]);
        const currentWeek = weeks?.[0] ?? null;
        if (currentWeek) setWeek(currentWeek);
        setMembers(board);

        if (currentWeek) {
          const weekMatchups = await api(`/leagues/${leagueId}/matchups?weekNumber=${currentWeek.number}`);
          const mine = weekMatchups.find((m: any) => m.homeUserId === id || m.awayUserId === id);
          setMatchup(mine ?? null);
        }
      } catch {}
    }
    load();
  }, []);

  async function removeMember(memberId: string) {
    try {
      await api(`/leagues/${leagueId}/members/${memberId}`, { method: "DELETE" });
      setMembers((prev) => prev.filter((m) => m.userId !== memberId));
    } catch (err: any) {
      try { alert(JSON.parse(err.message).error); } catch { alert(err.message); }
    }
  }

  function copyCode() {
    navigator.clipboard.writeText(league.inviteCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const isCreator = league?.creatorId === userId;
  const myRank = members.findIndex((m) => m.userId === userId) + 1;
  const myRecord = members.find((m) => m.userId === userId);

  async function startSeason() {
    try {
      await api(`/leagues/${leagueId}/season/start`, { method: "POST" });
      const leagueData = await api(`/leagues/${leagueId}`);
      setLeague(leagueData);
    } catch (err: any) {
      try { alert(JSON.parse(err.message).error); } catch { alert(err.message); }
    }
  }

  if (!league) return <div className="loading">Loading…</div>;

  const weekStatus = week?.resolved ? "FINAL" : week?.locked ? "LOCKED" : week ? "LIVE" : null;
  const weekStatusClass = week?.resolved ? "" : week?.locked ? "badge-red" : "badge-green";

  return (
    <>
      <nav className="nav">
        <div className="nav-logo">PLAY<span className="accent">BOOK</span></div>
        <Link href="/leagues" style={{ fontSize: "0.82rem", color: "var(--text-2)" }}>‹ Leagues</Link>
      </nav>

      <div className="page">
        {/* League header */}
        <div style={{ marginBottom: 20 }}>
          <h1>{league.name}</h1>
          {myRank > 0 && (
            <div style={{ color: "var(--text-2)", fontSize: "0.85rem", marginTop: 4 }}>
              Rank #{myRank} of {members.length}
            </div>
          )}
        </div>

        {/* Balance hero */}
        <div className="card-accent" style={{ marginBottom: 10 }}>
          <div className="row" style={{ alignItems: "flex-start" }}>
            <div>
              <div className="label">Your Balance</div>
              <div className="balance-big" style={{ marginTop: 4 }}>
                ${(membership?.balance ?? 0).toLocaleString()}
              </div>
              <div style={{ marginTop: 8, color: "var(--text-2)", fontSize: "0.8rem" }}>
                ${league.weeklyAllowance}/week allowance
              </div>
            </div>
            {myRecord && (myRecord.wins > 0 || myRecord.losses > 0 || myRecord.ties > 0) && (
              <div style={{ textAlign: "right" }}>
                <div className="label">Record</div>
                <div style={{ fontSize: "1.4rem", fontWeight: 900, letterSpacing: "-0.02em", marginTop: 4 }}>
                  <span style={{ color: "var(--win)" }}>{myRecord.wins}</span>
                  <span style={{ color: "var(--text-3)" }}>-</span>
                  <span style={{ color: "var(--loss)" }}>{myRecord.losses}</span>
                  {myRecord.ties > 0 && <span style={{ color: "var(--text-3)" }}>-{myRecord.ties}</span>}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Matchup widget */}
        {matchup && (
          <div className="card" style={{ marginBottom: 10 }}>
            <div className="label" style={{ marginBottom: 8 }}>This Week's Matchup</div>
            {(() => {
              const isHome = matchup.homeUserId === userId;
              const me = isHome ? matchup.homeUser : matchup.awayUser;
              const opp = isHome ? matchup.awayUser : matchup.homeUser;
              const myProfit = isHome ? matchup.homeProfit : matchup.awayProfit;
              const oppProfit = isHome ? matchup.awayProfit : matchup.homeProfit;
              const resolved = matchup.homeProfit != null;
              const iWon = matchup.winnerId === userId;
              const iLost = matchup.winnerId && matchup.winnerId !== userId;

              return (
                <div className="row">
                  <div style={{ textAlign: "center" }}>
                    <div className="avatar" style={{ margin: "0 auto 4px" }}>{me.displayName.slice(0, 2).toUpperCase()}</div>
                    <div style={{ fontSize: "0.78rem", fontWeight: 700 }}>You</div>
                    {resolved && (
                      <div style={{ fontSize: "1rem", fontWeight: 900, color: myProfit >= 0 ? "var(--win)" : "var(--loss)", marginTop: 2 }}>
                        {myProfit >= 0 ? "+" : ""}{myProfit}
                      </div>
                    )}
                  </div>
                  <div style={{ textAlign: "center" }}>
                    {resolved ? (
                      <div style={{ fontWeight: 800, fontSize: "0.85rem", color: matchup.isTie ? "var(--text-2)" : iWon ? "var(--win)" : "var(--loss)" }}>
                        {matchup.isTie ? "TIE" : iWon ? "WIN" : "LOSS"}
                      </div>
                    ) : (
                      <div style={{ color: "var(--text-3)", fontWeight: 700, fontSize: "0.85rem" }}>VS</div>
                    )}
                  </div>
                  <div style={{ textAlign: "center" }}>
                    <div className="avatar" style={{ margin: "0 auto 4px" }}>{opp.displayName.slice(0, 2).toUpperCase()}</div>
                    <div style={{ fontSize: "0.78rem", fontWeight: 700 }}>{opp.displayName}</div>
                    {resolved && (
                      <div style={{ fontSize: "1rem", fontWeight: 900, color: oppProfit >= 0 ? "var(--win)" : "var(--loss)", marginTop: 2 }}>
                        {oppProfit >= 0 ? "+" : ""}{oppProfit}
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}
          </div>
        )}

        {/* Commissioner panel */}
        {isCreator && (
          <div className="card" style={{ marginBottom: 10 }}>
            <div className="row" style={{ marginBottom: showMembers ? 16 : 0 }}>
              <div>
                <div className="label">Invite Code</div>
                <div className="invite-code" style={{ fontSize: "1.8rem", marginTop: 2 }}>{league.inviteCode}</div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-end" }}>
                <button className="secondary" style={{ fontSize: "0.78rem", padding: "6px 14px" }} onClick={copyCode}>
                  {copied ? "✓ Copied" : "Copy"}
                </button>
                <button className="ghost" style={{ fontSize: "0.78rem", padding: "6px 14px" }} onClick={() => setShowMembers(!showMembers)}>
                  Members
                </button>
              </div>
            </div>
            {!league.seasonStarted && (
              <div style={{ marginTop: showMembers ? 0 : 12, paddingTop: 12, borderTop: "1px solid var(--border)" }}>
                <div style={{ color: "var(--text-2)", fontSize: "0.8rem", marginBottom: 8 }}>
                  {members.length % 2 !== 0
                    ? `Need even number of members (currently ${members.length})`
                    : `${members.length} members ready — start when everyone has joined`}
                </div>
                <button
                  onClick={startSeason}
                  disabled={members.length < 2 || members.length % 2 !== 0}
                  style={{ width: "100%", padding: "12px" }}
                >
                  Start Season →
                </button>
              </div>
            )}
            {league.seasonStarted && (
              <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--border)" }}>
                <span className="badge badge-green">Season Active</span>
              </div>
            )}
            {showMembers && (
              <div>
                <hr />
                {members.map((m: any) => (
                  <div key={m.userId} className="row" style={{ marginBottom: 10 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <div className="avatar" style={{ width: 30, height: 30, fontSize: "0.7rem" }}>
                        {m.displayName.slice(0, 2).toUpperCase()}
                      </div>
                      <span style={{ fontWeight: 600, fontSize: "0.9rem" }}>
                        {m.displayName}
                        {m.userId === userId && <span className="badge" style={{ marginLeft: 6 }}>you</span>}
                      </span>
                    </div>
                    {m.userId !== userId && (
                      <button className="ghost" style={{ fontSize: "0.75rem", padding: "4px 10px", color: "var(--loss)", borderColor: "rgba(255,68,102,0.3)" }} onClick={() => removeMember(m.userId)}>
                        Remove
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Current week */}
        <h2>Current Week</h2>
        {week ? (
          <div className="card">
            <div className="row" style={{ marginBottom: 16 }}>
              <div style={{ fontWeight: 800, fontSize: "1rem" }}>Week {week.number}</div>
              {weekStatus && <span className={`badge ${weekStatusClass}`}>{weekStatus}</span>}
            </div>

            {week.games?.length ? week.games.map((game: any) => (
              <div key={game.id} style={{ marginBottom: 16 }}>
                <div style={{ fontSize: "0.78rem", fontWeight: 700, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>
                  {game.homeTeam} <span style={{ fontWeight: 400 }}>vs</span> {game.awayTeam}
                </div>
                {game.props?.map((prop: any) => (
                  <div key={prop.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 12px", background: "var(--surface-2)", borderRadius: 8, marginBottom: 6 }}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: "0.9rem" }}>{prop.player?.name}</div>
                      <div style={{ color: "var(--text-3)", fontSize: "0.75rem", marginTop: 2 }}>
                        {prop.statType.replaceAll("_", " ")} · O/U {prop.line}
                      </div>
                    </div>
                    {prop.result != null ? (
                      <span className="badge badge-green">{prop.result}</span>
                    ) : (
                      <span style={{ color: "var(--text-3)", fontSize: "0.78rem" }}>Open</span>
                    )}
                  </div>
                ))}
              </div>
            )) : (
              <p style={{ color: "var(--text-3)", fontSize: "0.85rem" }}>No games this week yet.</p>
            )}
          </div>
        ) : (
          <div className="card">
            <div className="empty" style={{ padding: "24px 0" }}>
              <div className="empty-icon">📅</div>
              <div className="empty-text">No active week</div>
            </div>
          </div>
        )}

        {week && !week.locked && !week.resolved && (
          <Link href={`/leagues/${leagueId}/bet`}>
            <button style={{ width: "100%", marginTop: 4, padding: "15px" }}>Place Bets →</button>
          </Link>
        )}
      </div>

      <BottomNav leagueId={leagueId} />
    </>
  );
}
