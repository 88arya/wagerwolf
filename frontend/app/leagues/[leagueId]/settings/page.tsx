"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { ACCENT } from "@/lib/constants";
import { fmtMoney, toCents, toDollars } from "@/lib/money";
import HelmetAvatar from "@/components/HelmetAvatar";

const MAX_NFL_WEEK = 17;

function CardHeader({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ padding: "8px 14px", borderBottom: "1px solid var(--border)" }}>
      <span style={{ fontSize: "0.58rem", fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--text)" }}>{children}</span>
    </div>
  );
}

export default function LeagueSettingsPage({ params }: PageProps<"/leagues/[leagueId]/settings">) {
  const router = useRouter();
  const [leagueId, setLeagueId] = useState("");
  const [league, setLeague] = useState<any>(null);
  const [members, setMembers] = useState<any[]>([]);
  const [pendingMembers, setPendingMembers] = useState<any[]>([]);
  const [userId, setUserId] = useState("");
  const [copied, setCopied] = useState(false);

  const [settingsForm, setSettingsForm] = useState({
    name: "", weeklyAllowance: "",
    startWeek: "", regularSeasonWeeks: "", playoffSize: "",
    isPublic: false, maxPublicPlayers: "0",
  });
  const [settingsError, setSettingsError] = useState("");
  const [settingsSaved, setSettingsSaved] = useState(false);

  const [limitsForm, setLimitsForm] = useState({ maxStakePerBet: "", maxBetsPerWeek: "", maxParlayLegs: "", feedVisibility: "AFTER_KICKOFF" });
  const [limitsError, setLimitsError] = useState("");
  const [limitsSaved, setLimitsSaved] = useState(false);

  const [playoffMatchups, setPlayoffMatchups] = useState<any[]>([]);

  useEffect(() => {
    async function load() {
      if (!localStorage.getItem("token")) { router.push("/"); return; }
      const uid = localStorage.getItem("userId")!;
      setUserId(uid);
      const { leagueId: lid } = await params;
      setLeagueId(lid);

      const leagueData = await api(`/leagues/${lid}`);
      setLeague(leagueData);
      setSettingsForm({
        name: leagueData.name ?? "",
        weeklyAllowance: String(toDollars(leagueData.weeklyAllowance ?? 30000)),
        startWeek: String(leagueData.startWeek ?? 1),
        regularSeasonWeeks: String(leagueData.regularSeasonWeeks ?? 13),
        playoffSize: String(leagueData.playoffSize ?? 4),
        isPublic: Boolean(leagueData.isPublic),
        maxPublicPlayers: String(leagueData.maxPublicPlayers ?? 0),
      });
      setLimitsForm({
        maxStakePerBet: leagueData.maxStakePerBet != null ? String(toDollars(leagueData.maxStakePerBet)) : "",
        maxBetsPerWeek: leagueData.maxBetsPerWeek != null ? String(leagueData.maxBetsPerWeek) : "",
        maxParlayLegs: leagueData.maxParlayLegs != null ? String(leagueData.maxParlayLegs) : "",
        feedVisibility: leagueData.feedVisibility ?? "AFTER_KICKOFF",
      });

      try {
        const [board, allMatchups] = await Promise.all([
          api(`/leagues/${lid}/leaderboard`),
          api(`/leagues/${lid}/matchups`),
        ]);
        setMembers(board);
        setPlayoffMatchups(allMatchups.filter((m: any) => m.isPlayoff));
        if (leagueData.creatorId === uid) {
          const pending = await api(`/leagues/${lid}/pending`);
          setPendingMembers(pending);
        }
      } catch {}
    }
    load();
  }, []);

  function copyCode() {
    navigator.clipboard.writeText(league.inviteCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function removeMember(memberId: string) {
    if (!confirm("Remove this member?")) return;
    try {
      await api(`/leagues/${leagueId}/members/${memberId}`, { method: "DELETE" });
      setMembers((prev) => prev.filter((m) => m.userId !== memberId));
    } catch (err: any) {
      try { alert(JSON.parse(err.message).error); } catch { alert(err.message); }
    }
  }

  async function acceptMember(memberId: string) {
    try {
      await api(`/leagues/${leagueId}/members/${memberId}/accept`, { method: "POST", body: JSON.stringify({}) });
      setPendingMembers((prev) => prev.filter((m) => m.userId !== memberId));
      const board = await api(`/leagues/${leagueId}/leaderboard`);
      setMembers(board);
    } catch (err: any) {
      try { alert(JSON.parse(err.message).error); } catch { alert(err.message); }
    }
  }

  async function rejectMember(memberId: string) {
    try {
      await api(`/leagues/${leagueId}/members/${memberId}`, { method: "DELETE" });
      setPendingMembers((prev) => prev.filter((m) => m.userId !== memberId));
    } catch (err: any) {
      try { alert(JSON.parse(err.message).error); } catch { alert(err.message); }
    }
  }

  async function deleteLeague() {
    if (!confirm(`Permanently delete "${league?.name}"? This cannot be undone.`)) return;
    try {
      await api(`/leagues/${leagueId}`, { method: "DELETE" });
      router.push("/leagues");
    } catch (err: any) {
      try { alert(JSON.parse(err.message).error); } catch { alert(err.message); }
    }
  }

  async function saveSettings(e: React.FormEvent) {
    e.preventDefault();
    setSettingsError(""); setSettingsSaved(false);
    try {
      const updated = await api(`/leagues/${leagueId}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: settingsForm.name.trim(),
          weeklyAllowance: toCents(settingsForm.weeklyAllowance),
          startWeek: Number(settingsForm.startWeek),
          regularSeasonWeeks: Number(settingsForm.regularSeasonWeeks),
          playoffSize: Number(settingsForm.playoffSize),
          isPublic: settingsForm.isPublic,
          ...(settingsForm.isPublic ? {} : { maxPublicPlayers: Number(settingsForm.maxPublicPlayers) }),
        }),
      });
      setLeague(updated); setSettingsSaved(true);
      setTimeout(() => setSettingsSaved(false), 2500);
    } catch (err: any) {
      try { setSettingsError(JSON.parse(err.message).error); } catch { setSettingsError(err.message); }
    }
  }

  async function saveLimits(e: React.FormEvent) {
    e.preventDefault();
    setLimitsError(""); setLimitsSaved(false);
    try {
      const updated = await api(`/leagues/${leagueId}/limits`, {
        method: "PATCH",
        body: JSON.stringify({
          maxStakePerBet: limitsForm.maxStakePerBet === "" ? null : toCents(limitsForm.maxStakePerBet),
          maxBetsPerWeek: limitsForm.maxBetsPerWeek === "" ? null : Number(limitsForm.maxBetsPerWeek),
          maxParlayLegs: limitsForm.maxParlayLegs === "" ? null : Number(limitsForm.maxParlayLegs),
          feedVisibility: limitsForm.feedVisibility,
        }),
      });
      setLeague(updated); setLimitsSaved(true);
      setTimeout(() => setLimitsSaved(false), 2500);
    } catch (err: any) {
      try { setLimitsError(JSON.parse(err.message).error); } catch { setLimitsError(err.message); }
    }
  }

  async function leaveLeague() {
    if (!confirm(`Leave "${league?.name}"?`)) return;
    try {
      await api(`/leagues/${leagueId}/leave`, { method: "POST", body: JSON.stringify({}) });
      router.push("/leagues");
    } catch (err: any) {
      try { alert(JSON.parse(err.message).error); } catch { alert(err.message); }
    }
  }

  if (!league) return <div className="loading">Loading…</div>;

  const isCreator = league.creatorId === userId;
  const sw = Number(settingsForm.startWeek) || 1;
  const rsw = Number(settingsForm.regularSeasonWeeks) || 13;
  const ps = Number(settingsForm.playoffSize) || 4;
  const pw = ps >= 2 ? Math.ceil(Math.log2(ps)) : 0;
  const endWeek = sw + rsw + pw - 1;
  const overLimit = endWeek > MAX_NFL_WEEK;
  const maxPlayers = league.maxPlayers ?? 10;
  const maxPlayoffRound = playoffMatchups.length > 0 ? Math.max(...playoffMatchups.map((m) => m.playoffRound ?? 1)) : 0;

  const toggleBtn = (active: boolean) => ({
    flex: 1, padding: "7px 10px", borderRadius: "var(--radius-sm)", fontSize: "0.78rem",
    fontWeight: active ? 700 : 500,
    background: active ? "var(--accent)" : "var(--surface-2)",
    color: active ? "#FFFFFF" : "var(--text-2)",
    border: active ? "1.5px solid var(--accent)" : "1.5px solid var(--border-2)",
    transition: "all 0.12s",
  });

  return (
    <div className="page-wide" style={{ display: "flex", flexDirection: "column", alignItems: "center", paddingTop: "5vh" }}>

      <div style={{ width: "100%", maxWidth: 860, marginBottom: 16, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ fontWeight: 900, fontSize: "1.1rem", letterSpacing: "-0.01em", color: "var(--text)" }}>League Settings</div>
        <div style={{ fontSize: "0.72rem", color: "var(--text-3)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 320 }}>{league.name}</div>
      </div>

      <div style={{ width: "100%", maxWidth: 860, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, alignItems: "start" }}>

        {/* ── Left column ── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>

          {/* Season Structure */}
          <div className="card" style={{ padding: 0, overflow: "hidden" }}>
            <CardHeader>Season Structure</CardHeader>
            {isCreator && !league.seasonStarted ? (
              <form onSubmit={saveSettings} style={{ display: "flex", flexDirection: "column", gap: 12, padding: 14 }}>
                <div>
                  <div className="label">League Name</div>
                  <input value={settingsForm.name} onChange={(e) => setSettingsForm({ ...settingsForm, name: e.target.value })} required />
                </div>
                <div>
                  <div className="label">Weekly Allowance ($)</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <button type="button" onClick={() => setSettingsForm({ ...settingsForm, weeklyAllowance: String(Math.max(25, Number(settingsForm.weeklyAllowance) - 25)) })}
                      style={{ width: 36, height: 36, padding: 0, fontSize: "1.1rem", fontWeight: 800, flexShrink: 0 }}>−</button>
                    <input type="text" inputMode="numeric" value={settingsForm.weeklyAllowance}
                      onChange={(e) => setSettingsForm({ ...settingsForm, weeklyAllowance: e.target.value.replace(/[^0-9]/g, "") })}
                      style={{ textAlign: "center", fontWeight: 800, fontSize: "1rem", fontVariantNumeric: "tabular-nums" }} required />
                    <button type="button" onClick={() => setSettingsForm({ ...settingsForm, weeklyAllowance: String(Number(settingsForm.weeklyAllowance) + 25) })}
                      style={{ width: 36, height: 36, padding: 0, fontSize: "1.1rem", fontWeight: 800, flexShrink: 0 }}>+</button>
                  </div>
                </div>
                <div>
                  <div className="label">Visibility</div>
                  <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
                    {([{ value: false, label: "Invite Only" }, { value: true, label: "Public" }] as const).map(({ value, label }) => (
                      <button key={label} type="button" onClick={() => setSettingsForm({ ...settingsForm, isPublic: value })}
                        style={toggleBtn(settingsForm.isPublic === value)}>
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
                {!settingsForm.isPublic && (
                  <div>
                    <div className="label">Max Public Fill Slots</div>
                    <input type="number" min="0" max={maxPlayers} placeholder="0 = invite-only"
                      value={settingsForm.maxPublicPlayers}
                      onChange={e => setSettingsForm({ ...settingsForm, maxPublicPlayers: e.target.value })} />
                  </div>
                )}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                  <div>
                    <div className="label">Start Wk</div>
                    <input type="number" min="1" max={MAX_NFL_WEEK} value={settingsForm.startWeek}
                      onChange={(e) => setSettingsForm({ ...settingsForm, startWeek: e.target.value })} required />
                  </div>
                  <div>
                    <div className="label">Reg Wks</div>
                    <input type="number" min="1" value={settingsForm.regularSeasonWeeks}
                      onChange={(e) => setSettingsForm({ ...settingsForm, regularSeasonWeeks: e.target.value })} required />
                  </div>
                  <div>
                    <div className="label">Playoff Teams</div>
                    <input type="number" min="2" max={maxPlayers - 1} value={settingsForm.playoffSize}
                      onChange={(e) => setSettingsForm({ ...settingsForm, playoffSize: e.target.value })} required />
                  </div>
                </div>
                <div style={{ fontSize: "0.7rem", color: overLimit ? "var(--loss)" : "var(--text-3)" }}>
                  {overLimit
                    ? `Season ends week ${endWeek}, exceeds week ${MAX_NFL_WEEK}`
                    : `Ends NFL week ${endWeek} · ${pw} playoff week${pw !== 1 ? "s" : ""}`}
                </div>
                {settingsError && <p className="error">{settingsError}</p>}
                <button type="submit" style={{ padding: "9px", fontSize: "0.82rem", fontWeight: 700 }}>
                  {settingsSaved ? "✓ Saved" : "Save Season Settings"}
                </button>
              </form>
            ) : (
              <div style={{ padding: "4px 0" }}>
                {[
                  ["Start Week", league.startWeek],
                  ["Regular Season Weeks", league.regularSeasonWeeks],
                  ["Playoff Teams", league.playoffSize],
                  ["Weekly Allowance", fmtMoney(league.weeklyAllowance)],
                  ["Max Players", league.maxPlayers],
                  ["Visibility", league.isPublic ? "Public" : "Invite Only"],
                ].map(([label, val], idx, arr) => (
                  <div key={label as string} style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "9px 14px",
                    borderBottom: idx < arr.length - 1 ? "1px solid var(--border)" : "none",
                  }}>
                    <span style={{ fontSize: "0.78rem", color: "var(--text-2)" }}>{label}</span>
                    <span style={{ fontSize: "0.78rem", fontWeight: 600, color: "var(--text)", fontVariantNumeric: "tabular-nums" }}>{val}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Betting Rules */}
          <div className="card" style={{ padding: 0, overflow: "hidden" }}>
            <CardHeader>Betting Rules</CardHeader>
            {isCreator ? (
              <form onSubmit={saveLimits} style={{ display: "flex", flexDirection: "column", gap: 12, padding: 14 }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  <div>
                    <div className="label">Max Stake / Bet</div>
                    <input type="number" min="0.01" step="0.01" placeholder="No limit" value={limitsForm.maxStakePerBet}
                      onChange={(e) => setLimitsForm({ ...limitsForm, maxStakePerBet: e.target.value })} />
                  </div>
                  <div>
                    <div className="label">Max Bets / Week</div>
                    <input type="number" min="1" placeholder="No limit" value={limitsForm.maxBetsPerWeek}
                      onChange={(e) => setLimitsForm({ ...limitsForm, maxBetsPerWeek: e.target.value })} />
                  </div>
                  <div style={{ gridColumn: "span 2" }}>
                    <div className="label">Max Parlay Legs</div>
                    <input type="number" min="2" placeholder="No limit" value={limitsForm.maxParlayLegs}
                      onChange={(e) => setLimitsForm({ ...limitsForm, maxParlayLegs: e.target.value })} />
                  </div>
                </div>
                <div>
                  <div className="label">Bet Feed Visibility</div>
                  <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
                    {[
                      { value: "AFTER_KICKOFF", label: "After kickoff" },
                      { value: "AFTER_RESOLVE", label: "After week resolves" },
                    ].map(({ value, label }) => (
                      <button key={value} type="button"
                        onClick={() => setLimitsForm({ ...limitsForm, feedVisibility: value })}
                        style={toggleBtn(limitsForm.feedVisibility === value)}>
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
                <div style={{ fontSize: "0.68rem", color: "var(--text-3)" }}>Leave blank for no limit. Changes apply immediately.</div>
                {limitsError && <p className="error">{limitsError}</p>}
                <button type="submit" style={{ padding: "9px", fontSize: "0.82rem", fontWeight: 700 }}>
                  {limitsSaved ? "✓ Saved" : "Save Betting Rules"}
                </button>
              </form>
            ) : (
              <div style={{ padding: "4px 0" }}>
                {[
                  ["Max Stake / Bet", league.maxStakePerBet != null ? fmtMoney(league.maxStakePerBet) : "No limit"],
                  ["Max Bets / Week", league.maxBetsPerWeek != null ? league.maxBetsPerWeek : "No limit"],
                  ["Max Parlay Legs", league.maxParlayLegs != null ? league.maxParlayLegs : "No limit"],
                  ["Feed Visibility", league.feedVisibility === "AFTER_RESOLVE" ? "After week resolves" : "After kickoff"],
                ].map(([label, val], idx, arr) => (
                  <div key={label as string} style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "9px 14px",
                    borderBottom: idx < arr.length - 1 ? "1px solid var(--border)" : "none",
                  }}>
                    <span style={{ fontSize: "0.78rem", color: "var(--text-2)" }}>{label}</span>
                    <span style={{ fontSize: "0.78rem", fontWeight: 600, color: "var(--text)", fontVariantNumeric: "tabular-nums" }}>{val}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── Right column ── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>

          {/* Invite Code */}
          <div className="card" style={{ padding: 0, overflow: "hidden" }}>
            <CardHeader>Invite Code</CardHeader>
            <div style={{ padding: 14, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
              <span className="invite-code" style={{ fontSize: "1.5rem" }}>{league.inviteCode}</span>
              <button type="button" onClick={copyCode}
                style={{ padding: "5px 12px", borderRadius: "var(--radius-sm)", fontSize: "0.78rem", fontWeight: 700, background: "none", border: "1px solid var(--border-2)", cursor: "pointer", color: "var(--text-2)", boxShadow: "none" }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--text-3)"; e.currentTarget.style.color = "var(--text)"; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--border-2)"; e.currentTarget.style.color = "var(--text-2)"; }}>
                {copied ? "✓ Copied" : "Copy"}
              </button>
            </div>
          </div>

          {/* Season status */}
          {isCreator && league.seasonStarted && (
            <div className="card" style={{ padding: 0, overflow: "hidden" }}>
              <CardHeader>Season</CardHeader>
              <div style={{ padding: 14 }}>
                {league.seasonEnded ? (
                  <span className="badge badge-blue">Season Complete</span>
                ) : playoffMatchups.length > 0 ? (
                  <div style={{ fontSize: "0.82rem", fontWeight: 600, color: "var(--text)" }}>
                    Playoffs — Round {maxPlayoffRound}
                    <div style={{ fontSize: "0.7rem", color: "var(--text-3)", fontWeight: 400, marginTop: 4 }}>
                      Bracket advances automatically after each week resolves
                    </div>
                  </div>
                ) : (
                  <div style={{ fontSize: "0.82rem", fontWeight: 600, color: "var(--text)" }}>
                    Regular Season — Week {league.startWeek}–{league.startWeek + league.regularSeasonWeeks - 1}
                    <div style={{ fontSize: "0.7rem", color: "var(--text-3)", fontWeight: 400, marginTop: 4 }}>
                      Playoffs begin week {league.startWeek + league.regularSeasonWeeks}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Join Requests */}
          {isCreator && pendingMembers.length > 0 && (
            <div className="card" style={{ padding: 0, overflow: "hidden" }}>
              <CardHeader>Join Requests ({pendingMembers.length})</CardHeader>
              {pendingMembers.map((m: any, idx: number) => (
                <div key={m.userId} style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  padding: "10px 14px",
                  borderBottom: idx < pendingMembers.length - 1 ? "1px solid var(--border)" : "none",
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 9, minWidth: 0 }}>
                    <HelmetAvatar color={m.helmetColor ?? ACCENT} initials={m.user.displayName.slice(0, 2).toUpperCase()} size={26} />
                    <span style={{ fontWeight: 500, fontSize: "0.8rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.user.displayName}</span>
                  </div>
                  <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
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

          {/* Members */}
          <div className="card" style={{ padding: 0, overflow: "hidden" }}>
            <CardHeader>Members ({members.length})</CardHeader>
            {members.map((m: any, idx: number) => (
              <div key={m.userId} style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "9px 14px",
                borderBottom: idx < members.length - 1 ? "1px solid var(--border)" : "none",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 9, minWidth: 0 }}>
                  <HelmetAvatar color={m.helmetColor ?? ACCENT} initials={(m.abbreviation || m.displayName).slice(0, 2)} size={26} />
                  <span style={{ fontWeight: m.userId === userId ? 700 : 400, fontSize: "0.8rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {m.displayName}
                    {m.userId === league.creatorId && <span style={{ fontSize: "0.62rem", color: "var(--text-3)", fontWeight: 400, marginLeft: 6 }}>commissioner</span>}
                    {m.userId === userId && <span style={{ fontSize: "0.62rem", color: "var(--text-3)", fontWeight: 400, marginLeft: 6 }}>you</span>}
                  </span>
                </div>
                {isCreator && m.userId !== userId && !league.seasonStarted && (
                  <button type="button" onClick={() => removeMember(m.userId)}
                    style={{ padding: "3px 9px", borderRadius: "var(--radius-sm)", fontSize: "0.7rem", fontWeight: 700, background: "none", border: "1px solid var(--loss-border)", color: "var(--loss)", cursor: "pointer", boxShadow: "none", flexShrink: 0 }}>
                    Remove
                  </button>
                )}
              </div>
            ))}
            {members.length === 0 && (
              <div style={{ padding: "16px 14px", color: "var(--text-3)", fontSize: "0.78rem" }}>No members yet</div>
            )}
          </div>

          {/* Danger zone */}
          {isCreator && !league.seasonStarted && (
            <div className="card" style={{ padding: 14 }}>
              {league.autoStartAt && (
                <div style={{ fontSize: "0.75rem", color: "var(--text-2)", marginBottom: 10 }}>
                  Season auto-starts{" "}
                  {new Date(league.autoStartAt).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
                  {" at "}
                  {new Date(league.autoStartAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                </div>
              )}
              <button type="button" onClick={deleteLeague}
                style={{ width: "100%", padding: "8px", borderRadius: "var(--radius-sm)", fontSize: "0.78rem", fontWeight: 700, background: "none", border: "1px solid var(--loss-border)", color: "var(--loss)", cursor: "pointer", boxShadow: "none" }}>
                Delete League
              </button>
            </div>
          )}

          {!isCreator && !league.seasonStarted && (
            <div className="card" style={{ padding: 14 }}>
              <button type="button" onClick={leaveLeague}
                style={{ width: "100%", padding: "8px", borderRadius: "var(--radius-sm)", fontSize: "0.78rem", fontWeight: 700, background: "none", border: "1px solid var(--loss-border)", color: "var(--loss)", cursor: "pointer", boxShadow: "none" }}>
                Leave League
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
