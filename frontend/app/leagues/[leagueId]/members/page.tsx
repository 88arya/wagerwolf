"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import HelmetAvatar, { HELMET_COLORS } from "@/components/HelmetAvatar";

const ACCENT = "#0070EB";

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

  const [profile, setProfile] = useState({ displayName: "", abbreviation: "", helmetColor: "" });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [saved, setSaved] = useState(false);

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

      const me = (board ?? []).find((m: any) => m.userId === id);
      if (me) {
        setProfile({ displayName: me.displayName ?? "", abbreviation: me.abbreviation ?? "", helmetColor: me.helmetColor ?? ACCENT });
      }

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

  async function saveProfile() {
    setSaveError(""); setSaving(true); setSaved(false);
    if (!profile.displayName.trim()) { setSaveError("Display name is required."); setSaving(false); return; }
    if (!profile.abbreviation.trim()) { setSaveError("Abbreviation is required."); setSaving(false); return; }
    try {
      await Promise.all([
        api(`/leagues/${leagueId}/my-display-name`, { method: "PATCH", body: JSON.stringify({ displayName: profile.displayName.trim() }) }),
        api(`/leagues/${leagueId}/my-abbreviation`, { method: "PATCH", body: JSON.stringify({ abbreviation: profile.abbreviation.trim() }) }),
        api(`/leagues/${leagueId}/my-helmet`, { method: "PATCH", body: JSON.stringify({ helmetColor: profile.helmetColor }) }),
      ]);
      setMembers(await api(`/leagues/${leagueId}/leaderboard`));
      window.dispatchEvent(new CustomEvent("league-profile-updated"));
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err: any) {
      try { setSaveError(JSON.parse(err.message).error); } catch { setSaveError(err.message); }
    } finally { setSaving(false); }
  }

  function copyCode() {
    navigator.clipboard.writeText(league.inviteCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (!league) return <div className="loading">Loading…</div>;

  const isCreator = league.creatorId === userId;
  const canStart = members.length >= 2;
  const myMember = members.find(m => m.userId === userId);

  return (
    <div className="page">

      {!league.seasonStarted && (
        <>
          {/* Invite code */}
          <div className="section-title" style={{ marginBottom: 8 }}>Invite Code</div>
          <div className="card" style={{ marginBottom: 12 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div className="invite-code">{league.inviteCode}</div>
              <button className="secondary" style={{ fontSize: "0.78rem", padding: "7px 14px" }} onClick={copyCode}>
                {copied ? "✓ Copied" : "Copy"}
              </button>
            </div>
          </div>

          {/* My profile editor */}
          {myMember && (
            <>
              <div className="section-title" style={{ marginBottom: 8 }}>Your Profile</div>
              <div className="card" style={{ marginBottom: 12 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 18 }}>
                  <HelmetAvatar color={profile.helmetColor || ACCENT} initials={(profile.abbreviation || "??")} size={44} />
                  <div>
                    <div style={{ fontWeight: 700, fontSize: "0.9rem" }}>{profile.displayName || "—"}</div>
                    <div style={{ fontSize: "0.72rem", color: "var(--text-3)", fontWeight: 600, letterSpacing: "0.1em", marginTop: 2 }}>{profile.abbreviation || "—"}</div>
                  </div>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  <div>
                    <div className="label">Display Name</div>
                    <input
                      value={profile.displayName}
                      onChange={e => setProfile(p => ({ ...p, displayName: e.target.value.slice(0, 30) }))}
                      maxLength={30}
                      placeholder="Your name in this league"
                    />
                  </div>

                  <div>
                    <div className="label">Abbreviation</div>
                    <input
                      value={profile.abbreviation}
                      onChange={e => setProfile(p => ({ ...p, abbreviation: e.target.value }))}
                      placeholder="e.g. JAY"
                      style={{ fontWeight: 800, maxWidth: 100 }}
                    />
                  </div>

                  <div>
                    <div className="label">Helmet Color</div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 6 }}>
                      {HELMET_COLORS.map(color => (
                        <button
                          key={color}
                          type="button"
                          onClick={() => setProfile(p => ({ ...p, helmetColor: color }))}
                          style={{
                            width: 30, height: 30, borderRadius: "50%", background: color, padding: 0, cursor: "pointer", flexShrink: 0,
                            border: profile.helmetColor === color ? "3px solid var(--text)" : "3px solid transparent",
                          }}
                        />
                      ))}
                    </div>
                  </div>

                  {saveError && <p className="error" style={{ margin: 0 }}>{saveError}</p>}

                  <button
                    onClick={saveProfile}
                    disabled={saving}
                    style={{ alignSelf: "flex-start", padding: "8px 20px", fontWeight: 700, fontSize: "0.85rem" }}
                  >
                    {saving ? "Saving…" : saved ? "✓ Saved" : "Save"}
                  </button>
                </div>
              </div>
            </>
          )}

          {/* Join requests (commissioner only) */}
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

          {/* Start league / waiting */}
          {isCreator ? (
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
          ) : (
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
              <HelmetAvatar color={m.helmetColor ?? ACCENT} initials={(m.displayName ?? "?").slice(0, 2)} size={36} />
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
