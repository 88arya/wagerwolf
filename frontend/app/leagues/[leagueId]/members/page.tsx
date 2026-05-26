"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import HelmetAvatar from "@/components/HelmetAvatar";

export default function MembersPage({ params }: PageProps<"/leagues/[leagueId]/members">) {
  const router = useRouter();
  const [leagueId, setLeagueId] = useState("");
  const [userId, setUserId] = useState("");
  const [league, setLeague] = useState<any>(null);
  const [members, setMembers] = useState<any[]>([]);
  const [pending, setPending] = useState<any[]>([]);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    async function load() {
      if (!localStorage.getItem("token")) { router.push("/"); return; }
      const id = localStorage.getItem("userId")!;
      setUserId(id);
      const { leagueId: lid } = await params;
      setLeagueId(lid);

      const [lg, board] = await Promise.all([
        api(`/leagues/${lid}`),
        api(`/leagues/${lid}/leaderboard`),
      ]);
      setLeague(lg);
      setMembers(board ?? []);

      if (lg.creatorId === id && !lg.seasonStarted) {
        try { setPending(await api(`/leagues/${lid}/pending`)); } catch {}
      }
    }
    load();
  }, []);

  async function startLeague() {
    setStartError(""); setStarting(true);
    try {
      await api(`/leagues/${leagueId}/season/start`, { method: "POST", body: JSON.stringify({}) });
      router.push(`/leagues/${leagueId}`);
    } catch (err: any) {
      try { setStartError(JSON.parse(err.message).error); } catch { setStartError(err.message); }
      setStarting(false);
    }
  }

  async function acceptMember(memberId: string) {
    try {
      await api(`/leagues/${leagueId}/members/${memberId}/accept`, { method: "POST", body: JSON.stringify({}) });
      setPending(prev => prev.filter(m => m.userId !== memberId));
      setMembers(await api(`/leagues/${leagueId}/leaderboard`));
    } catch (err: any) {
      try { alert(JSON.parse(err.message).error); } catch { alert(err.message); }
    }
  }

  async function rejectMember(memberId: string) {
    try {
      await api(`/leagues/${leagueId}/members/${memberId}`, { method: "DELETE" });
      setPending(prev => prev.filter(m => m.userId !== memberId));
    } catch (err: any) {
      try { alert(JSON.parse(err.message).error); } catch { alert(err.message); }
    }
  }

  function copyCode() {
    navigator.clipboard.writeText(league.inviteCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (!league) return <div className="loading">Loading…</div>;

  const isCreator = league.creatorId === userId;
  const canStart = members.length >= 2;

  return (
    <div className="page">

      {!league.seasonStarted && (
        <>
          <div className="section-title" style={{ marginBottom: 8 }}>Invite Code</div>
          <div className="card" style={{ marginBottom: 12 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div className="invite-code">{league.inviteCode}</div>
              <button className="secondary" style={{ fontSize: "0.78rem", padding: "7px 14px" }} onClick={copyCode}>
                {copied ? "✓ Copied" : "Copy"}
              </button>
            </div>
          </div>

          {isCreator && pending.length > 0 && (
            <>
              <div className="section-title" style={{ marginBottom: 8 }}>
                Join Requests
                <span className="badge badge-blue" style={{ marginLeft: 8 }}>{pending.length}</span>
              </div>
              <div className="card" style={{ marginBottom: 12, padding: 0, overflow: "hidden" }}>
                {pending.map((m: any, idx: number) => (
                  <div key={m.userId} style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "11px 14px",
                    borderBottom: idx < pending.length - 1 ? "1px solid var(--border)" : "none",
                  }}>
                    <span style={{ fontWeight: 600, fontSize: "0.88rem" }}>{m.user?.displayName ?? m.displayName}</span>
                    <div style={{ display: "flex", gap: 6 }}>
                      <button className="secondary" style={{ fontSize: "0.72rem", padding: "5px 10px", color: "var(--win)", borderColor: "var(--win-border)" }} onClick={() => acceptMember(m.userId)}>Accept</button>
                      <button className="ghost" style={{ fontSize: "0.72rem", padding: "5px 10px", color: "var(--loss)", borderColor: "var(--loss-border)" }} onClick={() => rejectMember(m.userId)}>Reject</button>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {isCreator && (
            <div className="card" style={{ marginBottom: 12 }}>
              <div style={{ fontSize: "0.8rem", color: "var(--text-2)", marginBottom: 10 }}>
                {!canStart
                  ? "Need at least 2 members to start"
                  : `${members.length} member${members.length !== 1 ? "s" : ""} ready — start the season when everyone has joined`}
              </div>
              {startError && <p className="error" style={{ marginBottom: 10 }}>{startError}</p>}
              <button
                onClick={startLeague}
                disabled={!canStart || starting}
                style={{ width: "100%", padding: "12px", fontSize: "0.9rem", fontWeight: 800, opacity: canStart ? 1 : 0.4 }}
              >
                {starting ? "Starting…" : "Start League"}
              </button>
            </div>
          )}

          {!isCreator && (
            <div className="card" style={{ marginBottom: 12, textAlign: "center", padding: "18px 16px" }}>
              <div style={{ fontSize: "0.82rem", color: "var(--text-2)" }}>
                Waiting for the commissioner to start the league
              </div>
            </div>
          )}
        </>
      )}

      <div className="section-title" style={{ marginBottom: 8 }}>
        Members
        <span style={{ color: "var(--text-3)", fontWeight: 500, fontSize: "0.78rem", marginLeft: 6 }}>({members.length})</span>
      </div>
      <div className="card" style={{ padding: 0, overflow: "hidden", background: "#fff" }}>
        {members.length === 0 && (
          <div style={{ padding: "20px 0", textAlign: "center", color: "var(--text-3)", fontSize: "0.82rem" }}>No members yet</div>
        )}
        {members.map((m: any, idx: number) => {
          const isMe = m.userId === userId;
          return (
            <div
              key={m.userId}
              onClick={() => league.seasonStarted && router.push(`/leagues/${leagueId}/members/${m.userId}`)}
              style={{
                display: "flex", alignItems: "center", gap: 12, padding: "12px 14px",
                borderBottom: idx < members.length - 1 ? "1px solid var(--border)" : "none",
                cursor: league.seasonStarted ? "pointer" : "default",
                transition: "background 0.1s",
              }}
              onMouseEnter={e => { if (league.seasonStarted) e.currentTarget.style.background = "var(--surface-2)"; }}
              onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
            >
              <HelmetAvatar color={m.helmetColor ?? "#0070EB"} initials={(m.displayName ?? "?").slice(0, 2)} size={36} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: "0.85rem", fontWeight: isMe ? 700 : 500, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {m.displayName}{isMe && <span style={{ fontSize: "0.65rem", color: "var(--text-3)", fontWeight: 400, marginLeft: 6 }}>you</span>}
                </div>
                {league.seasonStarted && (
                  <div style={{ fontSize: "0.7rem", color: "var(--text-3)", marginTop: 2 }}>
                    {m.wins}W – {m.losses}L{m.ties > 0 ? ` – ${m.ties}T` : ""} · #{m.rank}
                  </div>
                )}
              </div>
              {league.seasonStarted && (
                <div style={{ textAlign: "right", flexShrink: 0 }}>
                  <div style={{ fontSize: "0.8rem", fontWeight: 600, color: "var(--text)", fontVariantNumeric: "tabular-nums" }}>${m.balance.toLocaleString()}</div>
                  <div style={{ fontSize: "0.65rem", color: "var(--text-3)", marginTop: 2 }}>balance</div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
