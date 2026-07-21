"use client";

import { useEffect, useState } from "react";
import { Globe, Lock, Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { fmtMoney, toCents } from "@/lib/money";
import HelmetAvatar, { HELMET_COLORS } from "@/components/HelmetAvatar";

const NFL_LOCATIONS = [
  "Arizona","Atlanta","Baltimore","Buffalo","Carolina","Chicago",
  "Cincinnati","Cleveland","Dallas","Denver","Detroit","Green Bay",
  "Houston","Indianapolis","Jacksonville","Kansas City","Las Vegas",
  "Los Angeles","Miami","Minnesota","New England","New Orleans",
  "New York","Philadelphia","Pittsburgh","San Francisco","Seattle",
  "Tampa Bay","Tennessee","Washington",
];

const NFL_NICKNAMES = [
  "Cardinals","Falcons","Ravens","Bills","Panthers","Bears","Bengals",
  "Browns","Cowboys","Broncos","Lions","Packers","Texans","Colts",
  "Jaguars","Chiefs","Raiders","Chargers","Rams","Dolphins","Vikings",
  "Patriots","Saints","Giants","Jets","Eagles","Steelers","49ers",
  "Seahawks","Buccaneers","Titans","Commanders",
];

function randomLeagueName() {
  const loc = NFL_LOCATIONS[Math.floor(Math.random() * NFL_LOCATIONS.length)];
  const nick = NFL_NICKNAMES[Math.floor(Math.random() * NFL_NICKNAMES.length)];
  return `${loc} ${nick} ${new Date().getFullYear()} League`;
}

export default function LeaguesPage() {
  const router = useRouter();
  const [memberships, setMemberships] = useState<any[]>([]);
  const [pendingMemberships, setPendingMemberships] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [form, setForm] = useState({ name: "", weeklyAllowance: "300", maxPlayers: "10", isPublic: false, maxPublicPlayers: "0", maxBetsPerWeek: "", maxStakePerBet: "", startWeek: "1" });
  const [joinCode, setJoinCode] = useState("");
  const [error, setError] = useState("");
  const [joinError, setJoinError] = useState("");
  const [joinSuccess, setJoinSuccess] = useState("");
  const [view, setView] = useState<"menu" | "private" | "create">("menu");
  const [profileSetup, setProfileSetup] = useState<{
    leagueId: string; displayName: string; abbreviation: string; helmetColor: string; isPending: boolean;
  } | null>(null);
  const [profileSaving, setProfileSaving] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) { router.replace("/"); return; }
    setForm(f => ({ ...f, name: randomLeagueName() }));
    loadMemberships();
  }, []);

  async function loadMemberships() {
    try {
      setMemberships(await api("/memberships"));
      setPendingMemberships(await api("/memberships/pending").catch(() => []));
      setLoadError(false);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }

  async function createLeague(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    try {
      const league = await api("/leagues", {
        method: "POST",
        body: JSON.stringify({
          name: form.name,
          weeklyAllowance: toCents(form.weeklyAllowance),
          maxPlayers: Number(form.maxPlayers),
          isPublic: form.isPublic,
          maxPublicPlayers: Number(form.maxPublicPlayers),
          maxBetsPerWeek: form.maxBetsPerWeek !== "" ? Number(form.maxBetsPerWeek) : null,
          maxStakePerBet: form.maxStakePerBet !== "" ? toCents(form.maxStakePerBet) : null,
          startWeek: Number(form.startWeek),
        }),
      });
      const membership = await api(`/leagues/${league.id}/join`, { method: "POST", body: JSON.stringify({}) });
      setProfileSetup({ leagueId: league.id, displayName: membership.displayName, abbreviation: membership.abbreviation, helmetColor: membership.helmetColor, isPending: false });
    } catch (err: any) {
      try { setError(JSON.parse(err.message).error); } catch { setError(err.message); }
    }
  }

  async function joinPublic() {
    setJoinError(""); setJoinSuccess("");
    try {
      const result = await api("/memberships/join-public", { method: "POST", body: JSON.stringify({}) });
      setJoinSuccess(`Joined "${result.league?.name}"!`);
      loadMemberships();
    } catch (err: any) {
      try { setJoinError(JSON.parse(err.message).error); } catch { setJoinError(err.message); }
    }
  }

  async function joinPrivate(e: React.FormEvent) {
    e.preventDefault();
    setJoinError(""); setJoinSuccess("");
    try {
      await api("/memberships/join-by-code", { method: "POST", body: JSON.stringify({ code: joinCode }) });
      setJoinCode("");
      loadMemberships();
      setJoinSuccess("Request sent — waiting for commissioner approval.");
    } catch (err: any) {
      try { setJoinError(JSON.parse(err.message).error); } catch { setJoinError(err.message); }
    }
  }

  async function saveProfile() {
    if (!profileSetup) return;
    setProfileSaving(true);
    try {
      await Promise.all([
        api(`/leagues/${profileSetup.leagueId}/my-display-name`, { method: "PATCH", body: JSON.stringify({ displayName: profileSetup.displayName }) }),
        api(`/leagues/${profileSetup.leagueId}/my-abbreviation`, { method: "PATCH", body: JSON.stringify({ abbreviation: profileSetup.abbreviation }) }),
        api(`/leagues/${profileSetup.leagueId}/my-helmet`, { method: "PATCH", body: JSON.stringify({ helmetColor: profileSetup.helmetColor }) }),
      ]);
      if (!profileSetup.isPending) {
        router.push(`/leagues/${profileSetup.leagueId}/members`);
      } else {
        setProfileSetup(null);
        setJoinSuccess("Request sent — waiting for commissioner approval.");
      }
    } catch (err: any) {
      try { alert(JSON.parse(err.message).error); } catch { alert(err.message); }
    } finally {
      setProfileSaving(false);
    }
  }

  const playerOptions = [4, 6, 8, 10, 12, 14, 16, 18, 20];

  return (
    <>
      {/* Content */}
      <div className="page-wide" style={{ display: "flex", flexDirection: "column", alignItems: "center", paddingTop: "5vh" }}>

        <div style={{ width: "100%", marginBottom: 16, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ fontWeight: 900, fontSize: "1.1rem", letterSpacing: "-0.01em", color: "var(--text)" }}>My Leagues</div>
          <div style={{ display: "flex", gap: 6 }}>
            {([
              { label: "Create League", icon: <Plus size={13} />, accent: true, onClick: () => { setView(view === "create" ? "menu" : "create"); setError(""); } },
              { label: "Join Public", icon: <Globe size={13} />, accent: false, onClick: () => { joinPublic(); } },
              { label: "Join Private", icon: <Lock size={13} />, accent: false, onClick: () => { setView(view === "private" ? "menu" : "private"); setJoinError(""); setJoinSuccess(""); } },
            ] as const).map(({ label, icon, accent, onClick }) => (
              <button key={label} type="button" onClick={onClick}
                style={{ padding: "5px 12px", borderRadius: "var(--radius-sm)", fontSize: "0.78rem", fontWeight: 700, background: accent ? "var(--accent)" : "none", border: `1px solid ${accent ? "var(--accent)" : "var(--border-2)"}`, cursor: "pointer", color: accent ? "#fff" : "var(--text-2)", boxShadow: "none", display: "flex", alignItems: "center", gap: 5 }}
                onMouseEnter={e => { if (!accent) { e.currentTarget.style.borderColor = "var(--text-3)"; e.currentTarget.style.color = "var(--text)"; } }}
                onMouseLeave={e => { if (!accent) { e.currentTarget.style.borderColor = "var(--border-2)"; e.currentTarget.style.color = "var(--text-2)"; } }}>
                {icon}{label}
              </button>
            ))}
          </div>
        </div>

        {/* Leagues table + actions */}
        {(() => {
          const rows = [...memberships, ...pendingMemberships.map((m: any) => ({ ...m, _pending: true }))];
          const dash = <span style={{ color: "var(--text-3)" }}>—</span>;
          const TH = { fontSize: "0.65rem", fontWeight: 500, color: "var(--text-3)", padding: "10px 12px 8px", borderBottom: "1px solid var(--border-2)", whiteSpace: "nowrap" as const, overflow: "hidden" as const, textAlign: "left" as const, background: "transparent" };
          const THR = { ...TH, textAlign: "right" as const };
          const THC = { ...TH, textAlign: "center" as const };
          const TD = { fontSize: "0.78rem", fontWeight: 400, color: "var(--text)", padding: "10px 12px", borderTop: "1px solid var(--border)", fontVariantNumeric: "tabular-nums" as const, whiteSpace: "nowrap" as const, overflow: "hidden" as const };
          const TDR = { ...TD, textAlign: "right" as const };
          const TDC = { ...TD, textAlign: "center" as const };
          // "This week" columns (Balance + Active Bets) — accent treatment to flag they need attention
          const THA = { ...THC, color: "var(--accent)", fontWeight: 700 as const, borderBottom: "2px solid var(--accent)", background: "color-mix(in srgb, var(--accent) 7%, transparent)" };
          const TDA = { ...TDC, background: "color-mix(in srgb, var(--accent) 6%, transparent)" };
          const MINI = { fontSize: "0.6rem", fontWeight: 700, letterSpacing: "0.08em", color: "var(--text-3)", textTransform: "uppercase" as const };

          return (
            <div style={{ width: "100%", marginBottom: 24 }}>
              {loading && (
                <div style={{ padding: "32px 0", textAlign: "center", fontSize: "0.8rem", color: "var(--text-3)" }}>Loading leagues…</div>
              )}

              {!loading && loadError && (
                <div style={{ padding: "32px 0", textAlign: "center" }}>
                  <div style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--text-2)", marginBottom: 8 }}>Couldn't load your leagues</div>
                  <button type="button" onClick={() => { setLoading(true); loadMemberships(); }} style={{ padding: "6px 16px", fontSize: "0.78rem", fontWeight: 700 }}>Retry</button>
                </div>
              )}

              {!loading && !loadError && rows.length > 0 && (
                <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
                  <colgroup>
                    <col style={{ width: "24%" }} />
                    <col style={{ width: "11%" }} />
                    <col style={{ width: "10%" }} />
                    <col style={{ width: "9%" }} />
                    <col style={{ width: "11%" }} />
                    <col style={{ width: "9%" }} />
                    <col style={{ width: "9%" }} />
                    <col style={{ width: "7%" }} />
                    <col style={{ width: "7%" }} />
                    <col style={{ width: "3%" }} />
                  </colgroup>
                  <thead>
                    <tr>
                      <th style={TH}>LEAGUE</th>
                      <th style={TH}>YOU</th>
                      <th style={TH}>PHASE</th>
                      <th style={THA}>BALANCE</th>
                      <th style={THA}>ACTIVE BETS</th>
                      <th style={THC}>STANDING</th>
                      <th style={THC}>RECORD</th>
                      <th style={THC}>STREAK</th>
                      <th style={THC}>WIN %</th>
                      <th style={TH} aria-label="Open league" />
                    </tr>
                  </thead>
                  <tbody>
                  {rows.map((m: any) => {
                    const isPending = !!m._pending;
                    const ctx = m.weekContext;
                    const notStarted = isPending || !ctx || ctx.phase === "waiting";
                    const wins: number = m.wins ?? 0;
                    const losses: number = m.losses ?? 0;
                    const ties: number = m.ties ?? 0;
                    const total = wins + losses + ties;
                    const winPct = total > 0 ? Math.round(((wins + ties / 2) / total) * 100) : null;
                    const streak: string | null = m.streak ?? null;
                    const goToLeague = () => router.push(`/leagues/${m.leagueId}`);

                    let phaseState: string;
                    let phaseWeek: string | null = null;
                    if (isPending) phaseState = "Pending";
                    else if (!ctx || ctx.phase === "waiting") phaseState = "Lobby";
                    else if (ctx.phase === "ended") phaseState = ctx.champion ? "Champion" : "Complete";
                    else if (ctx.phase === "preseason") {
                      phaseState = "Upcoming";
                      phaseWeek = ctx.startsNflWeek != null ? `NFL Wk ${ctx.startsNflWeek}` : null;
                    } else if (ctx.phase === "playoffs") {
                      phaseState = ctx.alive === false ? "Eliminated" : "Playoffs";
                      phaseWeek = ctx.alive !== false && ctx.week != null ? `Rd ${ctx.week}${ctx.total ? `/${ctx.total}` : ""}` : null;
                    } else {
                      phaseState = "Regular";
                      phaseWeek = ctx.week != null ? `Wk ${ctx.week}${ctx.total ? `/${ctx.total}` : ""}` : null;
                    }

                    return (
                      <tr
                        key={m.id}
                        onClick={isPending ? undefined : goToLeague}
                        tabIndex={isPending ? undefined : 0}
                        onKeyDown={isPending ? undefined : e => { if (e.key === "Enter") goToLeague(); }}
                        style={{ cursor: isPending ? "default" : "pointer", opacity: isPending ? 0.6 : 1, transition: "background 0.08s" }}
                        onMouseEnter={isPending ? undefined : e => { (e.currentTarget as HTMLTableRowElement).style.background = "var(--surface-2)"; }}
                        onMouseLeave={isPending ? undefined : e => { (e.currentTarget as HTMLTableRowElement).style.background = "transparent"; }}
                      >
                        {/* League */}
                        <td style={TD}>
                          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <div style={{ width: 5, height: 30, background: m.helmetColor ?? "var(--border-2)", flexShrink: 0 }} />
                            {isPending ? (
                              <span style={{ fontWeight: 600, fontSize: "0.82rem", color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis" }}>{m.league?.name}</span>
                            ) : (
                              <Link href={`/leagues/${m.leagueId}`} onClick={e => e.stopPropagation()}
                                style={{ fontWeight: 600, fontSize: "0.82rem", color: "var(--text)", textDecoration: "none", overflow: "hidden", textOverflow: "ellipsis" }}>
                                {m.league?.name}
                              </Link>
                            )}
                          </div>
                        </td>
                        {/* You */}
                        <td style={TD}>
                          {m.abbreviation && <div style={MINI}>{m.abbreviation}</div>}
                          <div style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{m.displayName || dash}</div>
                        </td>
                        {/* Phase */}
                        <td style={TD}>
                          {phaseWeek && <div style={MINI}>{phaseWeek}</div>}
                          <div>{phaseState}</div>
                        </td>
                        {/* Balance */}
                        <td style={TDA}>{notStarted ? dash : fmtMoney(m.balance ?? 0)}</td>
                        {/* Active bets this week */}
                        <td style={TDA}>{notStarted ? dash : (m.betsThisWeek ?? 0)}</td>
                        {/* Standing */}
                        <td style={TDC}>
                          {notStarted || !m.rank ? dash : (
                            <span>
                              #{m.rank}
                              <span style={{ fontSize: "0.72rem" }}> / {m.totalMembers}</span>
                            </span>
                          )}
                        </td>
                        {/* Record */}
                        <td style={TDC}>{notStarted ? dash : `${wins}-${losses}-${ties}`}</td>
                        {/* Streak */}
                        <td style={TDC}>{notStarted || !streak ? dash : streak}</td>
                        {/* Win % */}
                        <td style={TDC}>{notStarted || winPct == null ? dash : `${winPct}%`}</td>
                        <td style={{ ...TDR, padding: "10px 12px 10px 4px" }}>
                          {!isPending && "›"}
                        </td>
                      </tr>
                    );
                  })}
                  </tbody>
                </table>
              )}

              {/* Empty state */}
              {!loading && !loadError && rows.length === 0 && (
                <div style={{ padding: "32px 0", textAlign: "center" }}>
                  <div style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--text-2)", marginBottom: 4 }}>No leagues yet</div>
                  <div style={{ fontSize: "0.75rem", color: "var(--text-3)" }}>Create a league, join a public one, or enter an invite code to get started</div>
                </div>
              )}

              {/* Join with code form */}
              {view === "private" && (
                <div style={{ padding: "16px 20px" }}>
                  <form onSubmit={joinPrivate} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <input
                      placeholder="INVITE CODE"
                      value={joinCode}
                      onChange={e => setJoinCode(e.target.value.toUpperCase())}
                      maxLength={6}
                      autoFocus
                      required
                      style={{ flex: 1, textTransform: "uppercase", letterSpacing: "0.3em", fontWeight: 900, textAlign: "center", fontSize: "1.1rem", color: "var(--accent)", padding: "8px" }}
                    />
                    <button type="submit" style={{ padding: "0 18px", height: 40, fontWeight: 800, fontSize: "1.1rem", flexShrink: 0 }}>›</button>
                  </form>
                  {joinError && <p className="error" style={{ marginTop: 8, marginBottom: 0 }}>{joinError}</p>}
                  {joinSuccess && <div style={{ marginTop: 8, background: "var(--win-bg)", border: "1px solid var(--win-border)", borderRadius: "var(--radius-sm)", padding: "8px 12px", color: "var(--win)", fontSize: "0.82rem", fontWeight: 700 }}>{joinSuccess}</div>}
                </div>
              )}

              {/* Join public feedback */}
              {view === "menu" && (joinError || joinSuccess) && (
                <div style={{ padding: "10px 20px" }}>
                  {joinError && <p className="error" style={{ margin: 0 }}>{joinError}</p>}
                  {joinSuccess && <div style={{ background: "var(--win-bg)", border: "1px solid var(--win-border)", borderRadius: "var(--radius-sm)", padding: "8px 12px", color: "var(--win)", fontSize: "0.82rem", fontWeight: 700 }}>{joinSuccess}</div>}
                </div>
              )}
            </div>
          );
        })()}

      </div>

      {/* Create League modal */}
      {view === "create" && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 1000, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "40px 16px", overflowY: "auto" }}>
          <div className="card" style={{ width: "100%", maxWidth: 460, padding: 24 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
              <div style={{ fontWeight: 800, fontSize: "1rem", color: "var(--text)" }}>Create League</div>
              <button onClick={() => setView("menu")} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-3)", padding: 4, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "none", borderRadius: "var(--radius-sm)", lineHeight: 1 }}
                onMouseEnter={e => { e.currentTarget.style.color = "var(--text)"; e.currentTarget.style.background = "var(--surface-2)"; }}
                onMouseLeave={e => { e.currentTarget.style.color = "var(--text-3)"; e.currentTarget.style.background = "none"; }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>
            <form className="form" onSubmit={createLeague}>
              <div>
                <div className="label">League Name</div>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required style={{ flex: 1 }} />
                  <button type="button" onClick={() => setForm(f => ({ ...f, name: randomLeagueName() }))} title="Randomize"
                    style={{ flexShrink: 0, background: "none", border: "1px solid var(--border-2)", borderRadius: "var(--radius-sm)", padding: "6px 8px", cursor: "pointer", color: "var(--text-3)", display: "flex", alignItems: "center", justifyContent: "center" }}
                    onMouseEnter={e => { e.currentTarget.style.color = "var(--text)"; e.currentTarget.style.borderColor = "var(--text-3)"; }}
                    onMouseLeave={e => { e.currentTarget.style.color = "var(--text-3)"; e.currentTarget.style.borderColor = "var(--border-2)"; }}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/>
                      <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/>
                    </svg>
                  </button>
                </div>
              </div>
              <div>
                <div className="label">Players</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginTop: 4 }}>
                  {playerOptions.map(n => {
                    const active = Number(form.maxPlayers) === n;
                    return (
                      <button key={n} type="button" onClick={() => setForm({ ...form, maxPlayers: String(n) })}
                        style={{ padding: "5px 11px", borderRadius: "var(--radius-sm)", fontSize: "0.82rem", fontWeight: active ? 800 : 600, background: active ? "var(--accent)" : "var(--surface-2)", color: active ? "#fff" : "var(--text-2)", border: active ? "1.5px solid var(--accent)" : "1.5px solid var(--border-2)" }}>
                        {n}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div>
                <div className="label">Visibility</div>
                <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
                  {([{ value: false, label: "Invite Only" }, { value: true, label: "Public" }] as const).map(({ value, label }) => {
                    const active = form.isPublic === value;
                    return (
                      <button key={label} type="button" onClick={() => setForm({ ...form, isPublic: value })}
                        style={{ flex: 1, padding: "8px", borderRadius: "var(--radius-sm)", fontSize: "0.82rem", fontWeight: active ? 800 : 600, background: active ? "var(--accent)" : "var(--surface-2)", color: active ? "#fff" : "var(--text-2)", border: active ? "1.5px solid var(--accent)" : "1.5px solid var(--border-2)" }}>
                        {label}
                      </button>
                    );
                  })}
                </div>
                <div style={{ fontSize: "0.68rem", color: "var(--text-3)", marginTop: 4, fontWeight: 600 }}>
                  {form.isPublic ? "Anyone can join without an invite code" : "Members join via invite code; you approve requests"}
                </div>
              </div>
              {!form.isPublic && (
                <div>
                  <div className="label">Max Public Fill Slots</div>
                  <input type="number" min="0" max={Number(form.maxPlayers)} placeholder="0 = invite-only" value={form.maxPublicPlayers} onChange={e => setForm({ ...form, maxPublicPlayers: e.target.value })} />
                  <div style={{ fontSize: "0.68rem", color: "var(--text-3)", marginTop: 4, fontWeight: 600 }}>Allow random players to fill remaining slots</div>
                </div>
              )}
              <div>
                <div className="label">Start Week</div>
                <input type="number" min="1" max="17" value={form.startWeek} onChange={e => setForm({ ...form, startWeek: e.target.value })} required />
                <div style={{ fontSize: "0.68rem", color: "var(--text-3)", marginTop: 4, fontWeight: 600 }}>NFL week your season begins</div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <div>
                  <div className="label">Max Bets / Week</div>
                  <input type="number" min="1" placeholder="No limit" value={form.maxBetsPerWeek} onChange={e => setForm({ ...form, maxBetsPerWeek: e.target.value })} />
                </div>
                <div>
                  <div className="label">Max Stake / Bet</div>
                  <input type="number" min="1" placeholder="No limit" value={form.maxStakePerBet} onChange={e => setForm({ ...form, maxStakePerBet: e.target.value })} />
                </div>
              </div>
              <div>
                <div className="label">Weekly Allowance ($)</div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <button type="button" onClick={() => setForm({ ...form, weeklyAllowance: String(Math.max(25, Number(form.weeklyAllowance) - 25)) })}
                    style={{ width: 36, height: 36, padding: 0, fontSize: "1.1rem", fontWeight: 800, flexShrink: 0 }}>−</button>
                  <input type="text" inputMode="numeric" value={form.weeklyAllowance}
                    onChange={e => setForm({ ...form, weeklyAllowance: e.target.value.replace(/[^0-9]/g, "") })}
                    style={{ textAlign: "center", fontWeight: 800, fontSize: "1rem", fontVariantNumeric: "tabular-nums" }} required />
                  <button type="button" onClick={() => setForm({ ...form, weeklyAllowance: String(Number(form.weeklyAllowance) + 25) })}
                    style={{ width: 36, height: 36, padding: 0, fontSize: "1.1rem", fontWeight: 800, flexShrink: 0 }}>+</button>
                </div>
              </div>
              {error && <p className="error">{error}</p>}
              <button type="submit" style={{ width: "100%", padding: "11px", fontSize: "0.9rem", fontWeight: 700 }}>Create League</button>
            </form>
          </div>
        </div>
      )}

      {/* Profile setup modal */}
      {profileSetup && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div className="card" style={{ width: "100%", maxWidth: 380, padding: 20 }}>
            <div style={{ fontWeight: 800, fontSize: "1rem", marginBottom: 4, color: "var(--text)" }}>Set up your league profile</div>
            <div style={{ fontSize: "0.78rem", color: "var(--text-3)", marginBottom: 18 }}>How you appear in this league</div>
            <div style={{ marginBottom: 12 }}>
              <div className="label">Display Name</div>
              <input value={profileSetup.displayName} onChange={e => setProfileSetup({ ...profileSetup, displayName: e.target.value })} maxLength={30} />
            </div>
            <div style={{ marginBottom: 12 }}>
              <div className="label">Abbreviation (2–3 letters)</div>
              <input value={profileSetup.abbreviation} onChange={e => setProfileSetup({ ...profileSetup, abbreviation: e.target.value.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 3) })} maxLength={3} style={{ letterSpacing: "0.2em", fontWeight: 800, textTransform: "uppercase" }} />
            </div>
            <div style={{ marginBottom: 20 }}>
              <div className="label">Helmet Color</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 6 }}>
                {HELMET_COLORS.map(color => (
                  <button key={color} type="button" onClick={() => setProfileSetup({ ...profileSetup, helmetColor: color })}
                    style={{ width: 28, height: 28, borderRadius: "50%", background: color, border: profileSetup.helmetColor === color ? "3px solid var(--text)" : "3px solid transparent", padding: 0, cursor: "pointer", flexShrink: 0 }} />
                ))}
              </div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={saveProfile} disabled={profileSaving} style={{ flex: 1, fontWeight: 800, padding: "11px" }}>{profileSaving ? "Saving…" : "Save Profile"}</button>
              <button className="secondary" onClick={() => { setProfileSetup(null); if (!profileSetup.isPending) router.push(`/leagues/${profileSetup.leagueId}/members`); }} style={{ padding: "11px 16px" }}>Skip</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
