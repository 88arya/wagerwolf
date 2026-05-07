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
        if (weeks?.length) setWeek(weeks[0]);
        setMembers(board);
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
          <div className="label">Your Balance</div>
          <div className="balance-big" style={{ marginTop: 4 }}>
            ${(membership?.balance ?? 0).toLocaleString()}
          </div>
          <div style={{ marginTop: 8, color: "var(--text-2)", fontSize: "0.8rem" }}>
            ${league.weeklyAllowance}/week allowance
          </div>
        </div>

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
