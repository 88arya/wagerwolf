"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import BottomNav from "@/components/BottomNav";

export default function SettingsPage({ params }: PageProps<"/leagues/[leagueId]/settings">) {
  const router = useRouter();
  const [leagueId, setLeagueId] = useState("");
  const [league, setLeague] = useState<any>(null);

  const [settingsForm, setSettingsForm] = useState({
    startWeek: "", regularSeasonWeeks: "", playoffSize: "", consolationWeeks: "", maxPublicPlayers: "",
  });
  const [settingsError, setSettingsError] = useState("");
  const [settingsSaved, setSettingsSaved] = useState(false);

  const [limitsForm, setLimitsForm] = useState({ maxStakePerBet: "", maxBetsPerWeek: "", maxParlayLegs: "", feedVisibility: "AFTER_KICKOFF" });
  const [limitsError, setLimitsError] = useState("");
  const [limitsSaved, setLimitsSaved] = useState(false);

  useEffect(() => {
    async function load() {
      if (!localStorage.getItem("token")) { router.push("/"); return; }
      const userId = localStorage.getItem("userId")!;
      const { leagueId: lid } = await params;
      setLeagueId(lid);

      const leagueData = await api(`/leagues/${lid}`);
      if (leagueData.creatorId !== userId) { router.push(`/leagues/${lid}`); return; }

      setLeague(leagueData);
      setSettingsForm({
        startWeek: String(leagueData.startWeek ?? 1),
        regularSeasonWeeks: String(leagueData.regularSeasonWeeks ?? 13),
        playoffSize: String(leagueData.playoffSize ?? 4),
        consolationWeeks: String(leagueData.consolationWeeks ?? 2),
        maxPublicPlayers: String(leagueData.maxPublicPlayers ?? 0),
      });
      setLimitsForm({
        maxStakePerBet: leagueData.maxStakePerBet != null ? String(leagueData.maxStakePerBet) : "",
        maxBetsPerWeek: leagueData.maxBetsPerWeek != null ? String(leagueData.maxBetsPerWeek) : "",
        maxParlayLegs: leagueData.maxParlayLegs != null ? String(leagueData.maxParlayLegs) : "",
        feedVisibility: leagueData.feedVisibility ?? "AFTER_KICKOFF",
      });
    }
    load();
  }, []);

  async function saveSettings(e: React.FormEvent) {
    e.preventDefault();
    setSettingsError("");
    setSettingsSaved(false);
    try {
      const updated = await api(`/leagues/${leagueId}`, {
        method: "PATCH",
        body: JSON.stringify({
          startWeek: Number(settingsForm.startWeek),
          regularSeasonWeeks: Number(settingsForm.regularSeasonWeeks),
          playoffSize: Number(settingsForm.playoffSize),
          consolationWeeks: Number(settingsForm.consolationWeeks),
          maxPublicPlayers: Number(settingsForm.maxPublicPlayers),
        }),
      });
      setLeague(updated);
      setSettingsSaved(true);
      setTimeout(() => setSettingsSaved(false), 2500);
    } catch (err: any) {
      try { setSettingsError(JSON.parse(err.message).error); } catch { setSettingsError(err.message); }
    }
  }

  async function saveLimits(e: React.FormEvent) {
    e.preventDefault();
    setLimitsError("");
    setLimitsSaved(false);
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
      setLeague(updated);
      setLimitsSaved(true);
      setTimeout(() => setLimitsSaved(false), 2500);
    } catch (err: any) {
      try { setLimitsError(JSON.parse(err.message).error); } catch { setLimitsError(err.message); }
    }
  }

  if (!league) return <div className="loading">Loading…</div>;

  const sw = Number(settingsForm.startWeek) || 1;
  const rsw = Number(settingsForm.regularSeasonWeeks) || 13;
  const ps = Number(settingsForm.playoffSize) || 4;
  const pw = ps >= 2 ? Math.ceil(Math.log2(ps)) : 0;
  const endWeek = sw + rsw + pw - 1;
  const overLimit = endWeek > 18;
  const maxTeams = league.maxTeams ?? 10;

  return (
    <>
      <nav className="nav">
        <div className="nav-logo">PLAY<span className="accent">BOOK</span></div>
        <Link href={`/leagues/${leagueId}`} style={{ fontSize: "0.82rem" }}>‹ Back</Link>
      </nav>

      <div className="page">
        <div style={{ marginBottom: 20, paddingTop: 4 }}>
          <h1 style={{ marginBottom: 4 }}>League Settings</h1>
          <p className="subtitle">{league.name}</p>
        </div>

        {/* Season Structure */}
        <div className="section-title" style={{ marginBottom: 10 }}>Season Structure</div>

        {league.seasonStarted ? (
          <div className="card" style={{ marginBottom: 12 }}>
            <div style={{ fontSize: "0.82rem", color: "var(--text-3)" }}>
              Season structure is locked after the season starts.
            </div>
          </div>
        ) : (
          <div className="card" style={{ marginBottom: 12 }}>
            <form onSubmit={saveSettings} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div>
                  <div className="label">Start Week</div>
                  <input
                    type="number" min="1" max="17"
                    value={settingsForm.startWeek}
                    onChange={(e) => setSettingsForm({ ...settingsForm, startWeek: e.target.value })}
                    required
                  />
                </div>
                <div>
                  <div className="label">Reg Season Weeks</div>
                  <input
                    type="number" min="1"
                    value={settingsForm.regularSeasonWeeks}
                    onChange={(e) => setSettingsForm({ ...settingsForm, regularSeasonWeeks: e.target.value })}
                    required
                  />
                </div>
                <div>
                  <div className="label">Playoff Teams</div>
                  <input
                    type="number" min="2" max={maxTeams - 1}
                    value={settingsForm.playoffSize}
                    onChange={(e) => setSettingsForm({ ...settingsForm, playoffSize: e.target.value })}
                    required
                  />
                </div>
                <div>
                  <div className="label">Consolation Weeks</div>
                  <input
                    type="number" min="1"
                    value={settingsForm.consolationWeeks}
                    onChange={(e) => setSettingsForm({ ...settingsForm, consolationWeeks: e.target.value })}
                    required
                  />
                </div>
                <div style={{ gridColumn: "span 2" }}>
                  <div className="label">Public Fill Slots</div>
                  <input
                    type="number" min="0" max={maxTeams}
                    placeholder="0 = invite-only"
                    value={settingsForm.maxPublicPlayers}
                    onChange={(e) => setSettingsForm({ ...settingsForm, maxPublicPlayers: e.target.value })}
                  />
                  <div style={{ fontSize: "0.72rem", color: "var(--text-3)", marginTop: 4 }}>
                    Allow random players to fill open slots
                  </div>
                </div>
              </div>
              <div style={{ fontSize: "0.75rem", color: overLimit ? "var(--loss)" : "var(--text-3)" }}>
                {overLimit
                  ? `⚠ Season ends week ${endWeek}, exceeds week 18`
                  : `Ends NFL week ${endWeek} · ${maxTeams - ps} consolation teams · ${pw} playoff weeks`}
              </div>
              {settingsError && <p className="error">{settingsError}</p>}
              <button type="submit" className="secondary">
                {settingsSaved ? "✓ Saved" : "Save Season Settings"}
              </button>
            </form>
          </div>
        )}

        {/* Betting Rules */}
        <div className="section-title" style={{ marginBottom: 10 }}>Betting Rules</div>
        <div className="card" style={{ marginBottom: 12 }}>
          <form onSubmit={saveLimits} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div>
                <div className="label">Max Stake / Bet</div>
                <input
                  type="number" min="1"
                  placeholder="No limit"
                  value={limitsForm.maxStakePerBet}
                  onChange={(e) => setLimitsForm({ ...limitsForm, maxStakePerBet: e.target.value })}
                />
              </div>
              <div>
                <div className="label">Max Bets / Week</div>
                <input
                  type="number" min="1"
                  placeholder="No limit"
                  value={limitsForm.maxBetsPerWeek}
                  onChange={(e) => setLimitsForm({ ...limitsForm, maxBetsPerWeek: e.target.value })}
                />
              </div>
              <div style={{ gridColumn: "span 2" }}>
                <div className="label">Max Parlay Legs</div>
                <input
                  type="number" min="2"
                  placeholder="No limit"
                  value={limitsForm.maxParlayLegs}
                  onChange={(e) => setLimitsForm({ ...limitsForm, maxParlayLegs: e.target.value })}
                />
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
                    <button
                      key={value}
                      type="button"
                      onClick={() => setLimitsForm({ ...limitsForm, feedVisibility: value })}
                      style={{
                        flex: 1, padding: "9px 10px", borderRadius: 8, fontSize: "0.82rem",
                        fontWeight: active ? 800 : 500,
                        background: active ? "var(--accent)" : "var(--surface-2)",
                        color: active ? "#080C14" : "var(--text-2)",
                        border: active ? "1.5px solid var(--accent)" : "1.5px solid var(--border)",
                      }}
                    >{label}</button>
                  );
                })}
              </div>
              <div style={{ fontSize: "0.7rem", color: "var(--text-3)", marginTop: 6 }}>
                When members can see each other's bets
              </div>
            </div>
            <div style={{ fontSize: "0.72rem", color: "var(--text-3)" }}>
              Leave blank for no limit. Changes apply immediately.
            </div>
            {limitsError && <p className="error">{limitsError}</p>}
            <button type="submit" className="secondary">
              {limitsSaved ? "✓ Saved" : "Save Betting Rules"}
            </button>
          </form>
        </div>
      </div>

      <BottomNav leagueId={leagueId} />
    </>
  );
}
