"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import HelmetAvatar from "@/components/HelmetAvatar";

const MAX_NFL_WEEK = 17;

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
        weeklyAllowance: String(leagueData.weeklyAllowance ?? 300),
        startWeek: String(leagueData.startWeek ?? 1),
        regularSeasonWeeks: String(leagueData.regularSeasonWeeks ?? 13),
        playoffSize: String(leagueData.playoffSize ?? 4),
        isPublic: Boolean(leagueData.isPublic),
        maxPublicPlayers: String(leagueData.maxPublicPlayers ?? 0),
      });
      setLimitsForm({
        maxStakePerBet: leagueData.maxStakePerBet != null ? String(leagueData.maxStakePerBet) : "",
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
          weeklyAllowance: Number(settingsForm.weeklyAllowance),
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
          maxStakePerBet: limitsForm.maxStakePerBet === "" ? null : Number(limitsForm.maxStakePerBet),
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

  return (
    <>
      <div className="page" style={{ paddingBottom: 100 }}>
        <div style={{ marginBottom: 18 }}>
          <h1>Manage League</h1>
          <p className="subtitle">{league.name}</p>
        </div>

        {/* Invite Code */}
        <div className="section-title" style={{ marginBottom: 8 }}>Invite Code</div>
        <div className="card" style={{ marginBottom: 10 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div className="invite-code">{league.inviteCode}</div>
            <button className="secondary" style={{ fontSize: "0.78rem", padding: "7px 14px" }} onClick={copyCode}>
              {copied ? "✓ Copied" : "Copy"}
            </button>
          </div>
        </div>

        {/* Join Requests */}
        {isCreator && pendingMembers.length > 0 && (
          <>
            <div className="section-title" style={{ marginBottom: 8 }}>
              Join Requests
              <span className="badge badge-blue" style={{ marginLeft: 8 }}>{pendingMembers.length}</span>
            </div>
            <div className="card" style={{ marginBottom: 10, padding: 0, overflow: "hidden" }}>
              {pendingMembers.map((m: any, idx: number) => (
                <div key={m.userId} style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  padding: "11px 14px",
                  borderBottom: idx < pendingMembers.length - 1 ? "1px solid var(--border)" : "none",
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                    <HelmetAvatar color={m.helmetColor ?? "#2563EB"} initials={m.user.displayName.slice(0, 2).toUpperCase()} size={30} />
                    <span style={{ fontWeight: 600, fontSize: "0.88rem" }}>{m.user.displayName}</span>
                  </div>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button className="secondary" style={{ fontSize: "0.72rem", padding: "5px 10px", color: "var(--win)", borderColor: "var(--win-border)" }} onClick={() => acceptMember(m.userId)}>Accept</button>
                    <button className="ghost" style={{ fontSize: "0.72rem", padding: "5px 10px", color: "var(--loss)", borderColor: "var(--loss-border)" }} onClick={() => rejectMember(m.userId)}>Reject</button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {/* Members */}
        <div className="section-title" style={{ marginBottom: 8 }}>
          Members
          <span style={{ color: "var(--text-3)", fontWeight: 500, fontSize: "0.78rem", marginLeft: 6 }}>({members.length})</span>
        </div>
        <div className="card" style={{ marginBottom: 10, padding: 0, overflow: "hidden" }}>
          {members.map((m: any, idx: number) => (
            <div key={m.userId} style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "10px 14px",
              borderBottom: idx < members.length - 1 ? "1px solid var(--border)" : "none",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                <HelmetAvatar color={m.helmetColor ?? "#2563EB"} initials={m.displayName.slice(0, 2).toUpperCase()} size={28} />
                <span style={{ fontWeight: 600, fontSize: "0.88rem" }}>
                  {m.displayName}
                  {m.userId === userId && <span className="badge" style={{ marginLeft: 6 }}>you</span>}
                </span>
              </div>
              {isCreator && m.userId !== userId && !league.seasonStarted && (
                <button className="ghost" style={{ fontSize: "0.7rem", padding: "4px 9px", color: "var(--loss)", borderColor: "var(--loss-border)" }} onClick={() => removeMember(m.userId)}>Remove</button>
              )}
            </div>
          ))}
          {members.length === 0 && (
            <div className="empty" style={{ padding: "16px 0" }}>
              <div className="empty-text">No members yet</div>
            </div>
          )}
        </div>

        {/* Season status — commissioner only, after start */}
        {isCreator && league.seasonStarted && (
          <>
            <div className="section-title" style={{ marginBottom: 8 }}>Season</div>
            <div className="card" style={{ marginBottom: 10 }}>
              {league.seasonEnded ? (
                <span className="badge badge-blue">Season Complete</span>
              ) : playoffMatchups.length > 0 ? (
                <div style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--text)" }}>
                  Playoffs — Round {maxPlayoffRound}
                  <div style={{ fontSize: "0.72rem", color: "var(--text-3)", fontWeight: 400, marginTop: 4 }}>
                    Bracket advances automatically after each week resolves
                  </div>
                </div>
              ) : (
                <div style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--text)" }}>
                  Regular Season — Week {league.startWeek}–{league.startWeek + league.regularSeasonWeeks - 1}
                  <div style={{ fontSize: "0.72rem", color: "var(--text-3)", fontWeight: 400, marginTop: 4 }}>
                    Playoffs begin week {league.startWeek + league.regularSeasonWeeks}
                  </div>
                </div>
              )}
            </div>
          </>
        )}

        {isCreator && !league.seasonStarted && (
          <>
            <div className="section-title" style={{ marginBottom: 8 }}>Season</div>
            <div className="card" style={{ marginBottom: 10 }}>
              {league.autoStartAt && (
                <div style={{ fontSize: "0.82rem", color: "var(--text)", fontWeight: 600, marginBottom: 10 }}>
                  Season auto-starts{" "}
                  {new Date(league.autoStartAt).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
                  {" at "}
                  {new Date(league.autoStartAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                </div>
              )}
              <button className="ghost" style={{ width: "100%", fontSize: "0.8rem", padding: "9px", color: "var(--loss)", borderColor: "var(--loss-border)" }} onClick={deleteLeague}>
                Delete League
              </button>
            </div>
          </>
        )}

        {/* Season Structure */}
        <div className="section-title" style={{ marginBottom: 8 }}>Season Structure</div>
        {isCreator && !league.seasonStarted ? (
          <div className="card" style={{ marginBottom: 10 }}>
            <form onSubmit={saveSettings} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div>
                <div className="label">League Name</div>
                <input value={settingsForm.name} onChange={(e) => setSettingsForm({ ...settingsForm, name: e.target.value })} required />
              </div>
              <div>
                <div className="label">Weekly Allowance ($)</div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <button type="button" onClick={() => setSettingsForm({ ...settingsForm, weeklyAllowance: String(Math.max(25, Number(settingsForm.weeklyAllowance) - 25)) })}
                    style={{ width: 38, height: 38, padding: 0, fontSize: "1.2rem", fontWeight: 700, flexShrink: 0 }}>−</button>
                  <input type="text" inputMode="numeric" value={settingsForm.weeklyAllowance}
                    onChange={(e) => setSettingsForm({ ...settingsForm, weeklyAllowance: e.target.value.replace(/[^0-9]/g, "") })}
                    style={{ textAlign: "center", fontWeight: 800, fontSize: "1.1rem", fontVariantNumeric: "tabular-nums" }} required />
                  <button type="button" onClick={() => setSettingsForm({ ...settingsForm, weeklyAllowance: String(Number(settingsForm.weeklyAllowance) + 25) })}
                    style={{ width: 38, height: 38, padding: 0, fontSize: "1.2rem", fontWeight: 700, flexShrink: 0 }}>+</button>
                </div>
              </div>
              <div>
                <div className="label">Visibility</div>
                <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                  {([{ value: false, label: "Invite Only" }, { value: true, label: "Public" }] as const).map(({ value, label }) => {
                    const active = settingsForm.isPublic === value;
                    return (
                      <button key={label} type="button" onClick={() => setSettingsForm({ ...settingsForm, isPublic: value })}
                        style={{ flex: 1, padding: "8px 10px", borderRadius: 6, fontSize: "0.85rem", fontWeight: active ? 800 : 500, background: active ? "var(--accent)" : "var(--surface-2)", color: active ? "#FFFFFF" : "var(--text-2)", border: active ? "1.5px solid var(--accent)" : "1.5px solid var(--border-2)", transition: "all 0.12s" }}>
                        {label}
                      </button>
                    );
                  })}
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
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div>
                  <div className="label">Start Week</div>
                  <input type="number" min="1" max={MAX_NFL_WEEK} value={settingsForm.startWeek}
                    onChange={(e) => setSettingsForm({ ...settingsForm, startWeek: e.target.value })} required />
                </div>
                <div>
                  <div className="label">Reg Season Weeks</div>
                  <input type="number" min="1" value={settingsForm.regularSeasonWeeks}
                    onChange={(e) => setSettingsForm({ ...settingsForm, regularSeasonWeeks: e.target.value })} required />
                </div>
                <div>
                  <div className="label">Playoff Teams</div>
                  <input type="number" min="2" max={maxPlayers - 1} value={settingsForm.playoffSize}
                    onChange={(e) => setSettingsForm({ ...settingsForm, playoffSize: e.target.value })} required />
                </div>
              </div>
              <div style={{ fontSize: "0.72rem", color: overLimit ? "var(--loss)" : "var(--text-3)" }}>
                {overLimit
                  ? `Season ends week ${endWeek}, exceeds week ${MAX_NFL_WEEK}`
                  : `Ends NFL week ${endWeek} · ${pw} playoff week${pw !== 1 ? "s" : ""}`}
              </div>
              {settingsError && <p className="error">{settingsError}</p>}
              <button type="submit" className="secondary">
                {settingsSaved ? "✓ Saved" : "Save Season Settings"}
              </button>
            </form>
          </div>
        ) : (
          <div className="card" style={{ marginBottom: 10 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              {[
                ["Start Week", league.startWeek],
                ["Reg Season Weeks", league.regularSeasonWeeks],
                ["Playoff Teams", league.playoffSize],
                ["Weekly Allowance", `$${league.weeklyAllowance}`],
                ["Max Players", league.maxPlayers],
                ["Visibility", league.isPublic ? "Public" : "Invite Only"],
              ].map(([label, val]) => (
                <div key={label as string}>
                  <div className="label">{label}</div>
                  <div style={{ fontSize: "0.88rem", fontWeight: 600, color: "var(--text)", paddingTop: 4 }}>{val}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Betting Rules */}
        <div className="section-title" style={{ marginBottom: 8 }}>Betting Rules</div>
        {isCreator ? (
          <div className="card" style={{ marginBottom: 10 }}>
            <form onSubmit={saveLimits} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div>
                  <div className="label">Max Stake / Bet</div>
                  <input type="number" min="1" placeholder="No limit" value={limitsForm.maxStakePerBet}
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
                <div className="label" style={{ marginBottom: 8 }}>Bet Feed Visibility</div>
                <div style={{ display: "flex", gap: 8 }}>
                  {[
                    { value: "AFTER_KICKOFF", label: "After kickoff" },
                    { value: "AFTER_RESOLVE", label: "After week resolves" },
                  ].map(({ value, label }) => {
                    const active = limitsForm.feedVisibility === value;
                    return (
                      <button key={value} type="button"
                        onClick={() => setLimitsForm({ ...limitsForm, feedVisibility: value })}
                        style={{ flex: 1, padding: "9px 10px", borderRadius: 6, fontSize: "0.8rem", fontWeight: active ? 800 : 500, background: active ? "var(--accent)" : "var(--surface-2)", color: active ? "#FFFFFF" : "var(--text-2)", border: active ? "1.5px solid var(--accent)" : "1.5px solid var(--border-2)", transition: "all 0.12s" }}
                      >{label}</button>
                    );
                  })}
                </div>
              </div>
              <div style={{ fontSize: "0.7rem", color: "var(--text-3)" }}>Leave blank for no limit. Changes apply immediately.</div>
              {limitsError && <p className="error">{limitsError}</p>}
              <button type="submit" className="secondary">{limitsSaved ? "✓ Saved" : "Save Betting Rules"}</button>
            </form>
          </div>
        ) : (
          <div className="card" style={{ marginBottom: 10 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              {[
                ["Max Stake / Bet", league.maxStakePerBet != null ? `$${league.maxStakePerBet}` : "No limit"],
                ["Max Bets / Week", league.maxBetsPerWeek != null ? league.maxBetsPerWeek : "No limit"],
                ["Max Parlay Legs", league.maxParlayLegs != null ? league.maxParlayLegs : "No limit"],
                ["Feed Visibility", league.feedVisibility === "AFTER_RESOLVE" ? "After week resolves" : "After kickoff"],
              ].map(([label, val]) => (
                <div key={label as string}>
                  <div className="label">{label}</div>
                  <div style={{ fontSize: "0.88rem", fontWeight: 600, color: "var(--text)", paddingTop: 4 }}>{val}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {!isCreator && !league.seasonStarted && (
          <div style={{ marginTop: 24 }}>
            <button className="ghost" style={{ width: "100%", fontSize: "0.8rem", padding: "9px", color: "var(--loss)", borderColor: "var(--loss-border)" }} onClick={leaveLeague}>
              Leave League
            </button>
          </div>
        )}
      </div>
    </>
  );
}
