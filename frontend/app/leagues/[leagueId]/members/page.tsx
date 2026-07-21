"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { fmtMoney } from "@/lib/money";
import HelmetAvatar, { HELMET_COLORS } from "@/components/HelmetAvatar";
import { ACCENT } from "@/lib/constants";

const TH = { fontSize: "0.65rem", fontWeight: 500, color: "var(--text-3)", padding: "10px 12px 8px", borderBottom: "1px solid var(--border-2)", whiteSpace: "nowrap" as const, overflow: "hidden" as const, textAlign: "left" as const, background: "transparent" };
const TD = { fontSize: "0.78rem", fontWeight: 400, color: "var(--text)", padding: "10px 12px", borderTop: "1px solid var(--border)", fontVariantNumeric: "tabular-nums" as const, whiteSpace: "nowrap" as const, overflow: "hidden" as const };

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
      if (myMember) {
        await Promise.all([
          api(`/leagues/${leagueId}/my-display-name`, { method: "PATCH", body: JSON.stringify({ displayName: profile.displayName.trim() }) }),
          api(`/leagues/${leagueId}/my-abbreviation`, { method: "PATCH", body: JSON.stringify({ abbreviation: profile.abbreviation.trim() }) }),
          api(`/leagues/${leagueId}/my-helmet`, { method: "PATCH", body: JSON.stringify({ helmetColor: profile.helmetColor }) }),
        ]);
      }
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
  const canStart = members.length >= 1;
  const myMember = members.find(m => m.userId === userId);

  const sectionLabel = { fontSize: "0.65rem", fontWeight: 500, color: "var(--text-3)", letterSpacing: "0.04em", marginBottom: 8 } as const;

  return (
    <div className="page-wide" style={{ display: "flex", flexDirection: "column", alignItems: "center", paddingTop: "5vh" }}>

      <div style={{ width: "100%", maxWidth: 860, marginBottom: 16, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ fontWeight: 900, fontSize: "1.1rem", letterSpacing: "-0.01em", color: "var(--text)" }}>
          {league.seasonStarted ? "Members" : "Lobby"}
        </div>
        <div style={{ fontSize: "0.72rem", color: "var(--text-3)" }}>
          {members.length} member{members.length !== 1 ? "s" : ""}{league.maxPlayers ? ` of ${league.maxPlayers}` : ""}
        </div>
      </div>

      <div style={{ width: "100%", maxWidth: 860 }}>

        {!league.seasonStarted && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 20, alignItems: "start" }}>

            {/* Left column: invite + start */}
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div className="card" style={{ padding: 0, overflow: "hidden" }}>
                <div style={{ padding: "8px 14px", borderBottom: "1px solid var(--border)" }}>
                  <span style={{ fontSize: "0.58rem", fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--text)" }}>Invite Code</span>
                </div>
                <div style={{ padding: "14px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                  <span className="invite-code" style={{ fontSize: "1.5rem" }}>{league.inviteCode}</span>
                  <button type="button" onClick={copyCode}
                    style={{ padding: "5px 12px", borderRadius: "var(--radius-sm)", fontSize: "0.78rem", fontWeight: 700, background: "none", border: "1px solid var(--border-2)", cursor: "pointer", color: "var(--text-2)", boxShadow: "none" }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--text-3)"; e.currentTarget.style.color = "var(--text)"; }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--border-2)"; e.currentTarget.style.color = "var(--text-2)"; }}>
                    {copied ? "✓ Copied" : "Copy"}
                  </button>
                </div>
              </div>

              {/* Join requests */}
              {isCreator && pending.length > 0 && (
                <div className="card" style={{ padding: 0, overflow: "hidden" }}>
                  <div style={{ padding: "8px 14px", borderBottom: "1px solid var(--border)" }}>
                    <span style={{ fontSize: "0.58rem", fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--text)" }}>
                      Join Requests ({pending.length})
                    </span>
                  </div>
                  {pending.map((m: any, idx: number) => (
                    <div key={m.userId} style={{
                      display: "flex", alignItems: "center", justifyContent: "space-between",
                      padding: "10px 14px",
                      borderBottom: idx < pending.length - 1 ? "1px solid var(--border)" : "none",
                    }}>
                      <span style={{ fontWeight: 500, fontSize: "0.8rem" }}>{m.user?.displayName ?? m.displayName}</span>
                      <div style={{ display: "flex", gap: 6 }}>
                        <button type="button" onClick={() => acceptMember(m.userId)}
                          style={{ padding: "4px 10px", borderRadius: "var(--radius-sm)", fontSize: "0.72rem", fontWeight: 700, background: "none", border: "1px solid var(--win-border)", color: "var(--win)", cursor: "pointer", boxShadow: "none" }}>
                          Accept
                        </button>
                        <button type="button" onClick={() => rejectMember(m.userId)}
                          style={{ padding: "4px 10px", borderRadius: "var(--radius-sm)", fontSize: "0.72rem", fontWeight: 700, background: "none", border: "1px solid var(--loss-border)", color: "var(--loss)", cursor: "pointer", boxShadow: "none" }}>
                          Reject
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Start / waiting */}
              {isCreator ? (
                <div className="card" style={{ padding: 14 }}>
                  <div style={{ fontSize: "0.75rem", color: "var(--text-2)", marginBottom: 10 }}>
                    {!canStart
                      ? "Need at least 1 member to start"
                      : `${members.length} member${members.length !== 1 ? "s" : ""} ready — start the season when everyone has joined`}
                  </div>
                  {startError && <p className="error" style={{ marginBottom: 10 }}>{startError}</p>}
                  <button
                    onClick={startLeague}
                    disabled={!canStart || starting}
                    style={{ width: "100%", padding: "10px", fontSize: "0.85rem", fontWeight: 700 }}
                  >
                    {starting ? "Starting…" : "Start League"}
                  </button>
                </div>
              ) : (
                <div className="card" style={{ padding: "16px 14px", textAlign: "center" }}>
                  <div style={{ fontSize: "0.78rem", color: "var(--text-2)" }}>
                    Waiting for the commissioner to start the league
                  </div>
                </div>
              )}
            </div>

            {/* Right column: profile editor */}
            {myMember && (
              <div className="card" style={{ padding: 0, overflow: "hidden" }}>
                <div style={{ padding: "8px 14px", borderBottom: "1px solid var(--border)" }}>
                  <span style={{ fontSize: "0.58rem", fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--text)" }}>Your Profile</span>
                </div>
                <div style={{ padding: 14 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
                    <HelmetAvatar color={profile.helmetColor || ACCENT} initials={(profile.abbreviation || "??")} size={40} />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: "0.85rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{profile.displayName || "—"}</div>
                      <div style={{ fontSize: "0.65rem", color: "var(--text-3)", fontWeight: 700, fontStyle: "italic", letterSpacing: "0.1em", marginTop: 1 }}>{profile.abbreviation || "—"}</div>
                    </div>
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
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
                        onChange={e => setProfile(p => ({ ...p, abbreviation: e.target.value.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 3) }))}
                        placeholder="e.g. JAY"
                        style={{ fontWeight: 800, maxWidth: 100, letterSpacing: "0.1em" }}
                      />
                    </div>

                    <div>
                      <div className="label">Helmet Color</div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginTop: 6 }}>
                        {HELMET_COLORS.map(color => (
                          <button
                            key={color}
                            type="button"
                            onClick={() => setProfile(p => ({ ...p, helmetColor: color }))}
                            style={{
                              width: 26, height: 26, borderRadius: 6, background: color, padding: 0, cursor: "pointer", flexShrink: 0,
                              outline: profile.helmetColor === color ? "2.5px solid var(--accent)" : "2px solid transparent",
                              outlineOffset: 2, border: "none",
                            }}
                          />
                        ))}
                      </div>
                    </div>

                    {saveError && <p className="error" style={{ margin: 0 }}>{saveError}</p>}

                    <button
                      onClick={saveProfile}
                      disabled={saving}
                      style={{ alignSelf: "flex-start", padding: "7px 18px", fontWeight: 700, fontSize: "0.8rem" }}
                    >
                      {saving ? "Saving…" : saved ? "✓ Saved" : "Save"}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Members table */}
        {!league.seasonStarted && <div style={sectionLabel}>MEMBERS</div>}
        {members.length === 0 ? (
          <div style={{ padding: "24px 0", color: "var(--text-3)", fontSize: "0.8rem" }}>No members yet</div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
            <colgroup>
              <col style={{ width: "36%" }} />
              {league.seasonStarted && <col style={{ width: "12%" }} />}
              {league.seasonStarted && <col style={{ width: "14%" }} />}
              {league.seasonStarted && <col style={{ width: "16%" }} />}
              <col style={{ width: league.seasonStarted ? "17%" : "59%" }} />
              <col style={{ width: "5%" }} />
            </colgroup>
            <thead style={{ boxShadow: "0 4px 4px -2px rgba(0,0,0,0.08)" }}>
              <tr>
                <th style={TH}>PLAYER</th>
                {league.seasonStarted && <th style={TH}>RANK</th>}
                {league.seasonStarted && <th style={TH}>RECORD</th>}
                {league.seasonStarted && <th style={TH}>BALANCE</th>}
                <th style={TH}>ROLE</th>
                <th style={TH} />
              </tr>
            </thead>
            <tbody>
              {members.map((m: any) => {
                const isMe = m.userId === userId;
                const clickable = !!league.seasonStarted;
                return (
                  <tr
                    key={m.userId}
                    onClick={() => clickable && router.push(`/leagues/${leagueId}/members/${m.userId}`)}
                    style={{ cursor: clickable ? "pointer" : "default", transition: "background 0.08s" }}
                    onMouseEnter={e => { if (clickable) (e.currentTarget as HTMLTableRowElement).style.background = "var(--surface-2)"; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLTableRowElement).style.background = "transparent"; }}
                  >
                    <td style={TD}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                        <div style={{ width: 5, height: 30, background: m.helmetColor ?? "var(--border-2)", flexShrink: 0 }} />
                        <HelmetAvatar color={m.helmetColor ?? ACCENT} initials={(m.abbreviation || m.displayName).slice(0, 2)} size={26} />
                        <div style={{ minWidth: 0 }}>
                          {m.abbreviation && <div style={{ fontSize: "0.6rem", color: "var(--text)", fontWeight: 700, fontStyle: "italic", letterSpacing: "0.1em" }}>{m.abbreviation}</div>}
                          <div style={{ fontSize: "0.78rem", fontWeight: isMe ? 700 : 400, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {m.displayName}{isMe && <span style={{ fontSize: "0.65rem", color: "var(--text-3)", fontWeight: 400, marginLeft: 6 }}>you</span>}
                          </div>
                        </div>
                      </div>
                    </td>
                    {league.seasonStarted && <td style={TD}>#{m.rank}</td>}
                    {league.seasonStarted && <td style={TD}>{m.wins}-{m.losses}{m.ties > 0 ? `-${m.ties}` : ""}</td>}
                    {league.seasonStarted && <td style={TD}>{fmtMoney(m.balance ?? 0)}</td>}
                    <td style={TD}>{m.userId === league.creatorId ? "Commissioner" : "Member"}</td>
                    <td style={{ ...TD, padding: "10px 12px 10px 4px" }}>{clickable && "›"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
