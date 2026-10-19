"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, apiError } from "@/lib/api";
import { ACCENT } from "@/lib/constants";
import { fmtMoney, toCents, toDollars } from "@/lib/money";
import HelmetAvatar from "@/components/HelmetAvatar";
import { MAX_NFL_WEEK } from "@/lib/constants";
import { Card, InviteCodeCard, JoinRequestsCard, outlineButton } from "../_shared/LeagueCards";
import type { League, Matchup, PendingMember, Standing } from "@/lib/types";

// Label/value rows shown to members who can't edit.
function ReadOnlyRows({ rows }: { rows: [string, React.ReactNode][] }) {
  return (
    <div style={{ padding: "4px 0" }}>
      {rows.map(([label, value], idx) => (
        <div key={label} style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "9px 14px",
          borderBottom: idx < rows.length - 1 ? "1px solid var(--border)" : "none",
        }}>
          <span style={{ fontSize: "0.78rem", color: "var(--text-2)" }}>{label}</span>
          <span style={{ fontSize: "0.78rem", fontWeight: 600, color: "var(--text)", fontVariantNumeric: "tabular-nums" }}>{value}</span>
        </div>
      ))}
    </div>
  );
}

function Toggle<T>({ options, value, onChange }: {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button key={o.label} type="button" onClick={() => onChange(o.value)} style={{
            flex: 1, padding: "7px 10px", borderRadius: "var(--radius-sm)", fontSize: "0.78rem",
            fontWeight: active ? 700 : 500,
            background: active ? "var(--accent)" : "var(--surface-2)",
            color: active ? "#FFFFFF" : "var(--text-2)",
            border: active ? "1.5px solid var(--accent)" : "1.5px solid var(--border-2)",
            transition: "all 0.12s",
          }}>
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

const wideDangerButton: React.CSSProperties = { ...outlineButton("loss"), width: "100%", padding: "8px", fontSize: "0.78rem" };
const stepperButton: React.CSSProperties = { width: 36, height: 36, padding: 0, fontSize: "1.1rem", fontWeight: 800, flexShrink: 0 };
const submitButton: React.CSSProperties = { padding: "9px", fontSize: "0.82rem", fontWeight: 700 };
const subtle: React.CSSProperties = { fontSize: "0.62rem", color: "var(--text-3)", fontWeight: 400, marginLeft: 6 };

export default function LeagueSettingsPage({ params }: PageProps<"/leagues/[leagueId]/settings">) {
  const router = useRouter();
  const [leagueId, setLeagueId] = useState("");
  const [league, setLeague] = useState<League | null>(null);
  const [members, setMembers] = useState<Standing[]>([]);
  const [pendingMembers, setPendingMembers] = useState<PendingMember[]>([]);
  const [userId, setUserId] = useState("");

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

  const [playoffMatchups, setPlayoffMatchups] = useState<Matchup[]>([]);

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
          api<Standing[]>(`/leagues/${lid}/leaderboard`),
          api<Matchup[]>(`/leagues/${lid}/matchups`),
        ]);
        setMembers(board);
        setPlayoffMatchups(allMatchups.filter((m) => m.isPlayoff));
        if (leagueData.creatorId === uid) {
          const pending = await api(`/leagues/${lid}/pending`);
          setPendingMembers(pending);
        }
      } catch {}
    }
    load();
  }, []);

  async function removeMember(memberId: string) {
    if (!confirm("Remove this member?")) return;
    try {
      await api(`/leagues/${leagueId}/members/${memberId}`, { method: "DELETE" });
      setMembers((prev) => prev.filter((m) => m.userId !== memberId));
    } catch (err) {
      alert(apiError(err));
    }
  }

  async function acceptMember(memberId: string) {
    try {
      await api(`/leagues/${leagueId}/members/${memberId}/accept`, { method: "POST", body: JSON.stringify({}) });
      setPendingMembers((prev) => prev.filter((m) => m.userId !== memberId));
      const board = await api(`/leagues/${leagueId}/leaderboard`);
      setMembers(board);
    } catch (err) {
      alert(apiError(err));
    }
  }

  async function rejectMember(memberId: string) {
    try {
      await api(`/leagues/${leagueId}/members/${memberId}`, { method: "DELETE" });
      setPendingMembers((prev) => prev.filter((m) => m.userId !== memberId));
    } catch (err) {
      alert(apiError(err));
    }
  }

  async function deleteLeague() {
    if (!confirm(`Permanently delete "${league?.name}"? This cannot be undone.`)) return;
    try {
      await api(`/leagues/${leagueId}`, { method: "DELETE" });
      router.push("/home");
    } catch (err) {
      alert(apiError(err));
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
    } catch (err) {
      setSettingsError(apiError(err));
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
    } catch (err) {
      setLimitsError(apiError(err));
    }
  }

  async function leaveLeague() {
    if (!confirm(`Leave "${league?.name}"?`)) return;
    try {
      await api(`/leagues/${leagueId}/leave`, { method: "POST", body: JSON.stringify({}) });
      router.push("/home");
    } catch (err) {
      alert(apiError(err));
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
    <div className="page-wide" style={{ display: "flex", flexDirection: "column", alignItems: "center", paddingTop: "5vh" }}>

      <div style={{ width: "100%", maxWidth: 860, marginBottom: 16, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ fontWeight: 900, fontSize: "1.1rem", letterSpacing: "-0.01em", color: "var(--text)" }}>League Settings</div>
        <div style={{ fontSize: "0.72rem", color: "var(--text-3)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 320 }}>{league.name}</div>
      </div>

      <div className="rg-2" style={{ width: "100%", maxWidth: 860, display: "grid", gap: 12, alignItems: "start" }}>

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>

          <Card title="Season Structure">
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
                      style={stepperButton}>−</button>
                    <input type="text" inputMode="numeric" value={settingsForm.weeklyAllowance}
                      onChange={(e) => setSettingsForm({ ...settingsForm, weeklyAllowance: e.target.value.replace(/[^0-9]/g, "") })}
                      style={{ textAlign: "center", fontWeight: 800, fontSize: "1rem", fontVariantNumeric: "tabular-nums" }} required />
                    <button type="button" onClick={() => setSettingsForm({ ...settingsForm, weeklyAllowance: String(Number(settingsForm.weeklyAllowance) + 25) })}
                      style={stepperButton}>+</button>
                  </div>
                </div>
                <div>
                  <div className="label">Visibility</div>
                  <Toggle
                    options={[{ value: false, label: "Invite Only" }, { value: true, label: "Public" }]}
                    value={settingsForm.isPublic}
                    onChange={(isPublic) => setSettingsForm({ ...settingsForm, isPublic })}
                  />
                </div>
                {!settingsForm.isPublic && (
                  <div>
                    <div className="label">Max Public Fill Slots</div>
                    <input type="number" min="0" max={maxPlayers} placeholder="0 = invite-only"
                      value={settingsForm.maxPublicPlayers}
                      onChange={e => setSettingsForm({ ...settingsForm, maxPublicPlayers: e.target.value })} />
                  </div>
                )}
                <div className="rg-3" style={{ display: "grid", gap: 8 }}>
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
                <button type="submit" style={submitButton}>
                  {settingsSaved ? "✓ Saved" : "Save Season Settings"}
                </button>
              </form>
            ) : (
              <ReadOnlyRows rows={[
                ["Start Week", league.startWeek],
                ["Regular Season Weeks", league.regularSeasonWeeks],
                ["Playoff Teams", league.playoffSize],
                ["Weekly Allowance", fmtMoney(league.weeklyAllowance)],
                ["Max Players", league.maxPlayers],
                ["Visibility", league.isPublic ? "Public" : "Invite Only"],
              ]} />
            )}
          </Card>

          <Card title="Betting Rules">
            {isCreator ? (
              <form onSubmit={saveLimits} style={{ display: "flex", flexDirection: "column", gap: 12, padding: 14 }}>
                <div className="rg-2" style={{ display: "grid", gap: 8 }}>
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
                  <Toggle
                    options={[
                      { value: "AFTER_KICKOFF", label: "After kickoff" },
                      { value: "AFTER_RESOLVE", label: "After week resolves" },
                    ]}
                    value={limitsForm.feedVisibility}
                    onChange={(feedVisibility) => setLimitsForm({ ...limitsForm, feedVisibility })}
                  />
                </div>
                <div style={{ fontSize: "0.68rem", color: "var(--text-3)" }}>Leave blank for no limit. Changes apply immediately.</div>
                {limitsError && <p className="error">{limitsError}</p>}
                <button type="submit" style={submitButton}>
                  {limitsSaved ? "✓ Saved" : "Save Betting Rules"}
                </button>
              </form>
            ) : (
              <ReadOnlyRows rows={[
                ["Max Stake / Bet", league.maxStakePerBet != null ? fmtMoney(league.maxStakePerBet) : "No limit"],
                ["Max Bets / Week", league.maxBetsPerWeek ?? "No limit"],
                ["Max Parlay Legs", league.maxParlayLegs ?? "No limit"],
                ["Feed Visibility", league.feedVisibility === "AFTER_RESOLVE" ? "After week resolves" : "After kickoff"],
              ]} />
            )}
          </Card>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>

          <InviteCodeCard code={league.inviteCode} />

          {isCreator && league.seasonStarted && (
            <Card title="Season">
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
            </Card>
          )}

          {isCreator && pendingMembers.length > 0 && (
            <JoinRequestsCard requests={pendingMembers} onAccept={acceptMember} onReject={rejectMember} />
          )}

          <Card title={`Members (${members.length})`}>
            {members.map((m, idx) => (
              <div key={m.userId} style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "9px 14px",
                borderBottom: idx < members.length - 1 ? "1px solid var(--border)" : "none",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 9, minWidth: 0 }}>
                  <HelmetAvatar color={m.helmetColor ?? ACCENT} initials={(m.abbreviation || m.displayName).slice(0, 2)} size={26} />
                  <span style={{ fontWeight: m.userId === userId ? 700 : 400, fontSize: "0.8rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {m.displayName}
                    {m.userId === league.creatorId && <span style={subtle}>commissioner</span>}
                    {m.userId === userId && <span style={subtle}>you</span>}
                  </span>
                </div>
                {isCreator && m.userId !== userId && !league.seasonStarted && (
                  <button type="button" onClick={() => removeMember(m.userId)}
                    style={{ ...outlineButton("loss"), padding: "3px 9px", fontSize: "0.7rem", flexShrink: 0 }}>
                    Remove
                  </button>
                )}
              </div>
            ))}
            {members.length === 0 && (
              <div style={{ padding: "16px 14px", color: "var(--text-3)", fontSize: "0.78rem" }}>No members yet</div>
            )}
          </Card>

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
              <button type="button" onClick={deleteLeague} style={wideDangerButton}>
                Delete League
              </button>
            </div>
          )}

          {!isCreator && !league.seasonStarted && (
            <div className="card" style={{ padding: 14 }}>
              <button type="button" onClick={leaveLeague} style={wideDangerButton}>
                Leave League
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
