"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
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

function UserIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}
function PlusIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
    </svg>
  );
}
function LockIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
      <path d="M7 11V7a5 5 0 0110 0v4"/>
    </svg>
  );
}
function PenIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/>
    </svg>
  );
}

export default function LeaguesPage() {
  const router = useRouter();
  const [memberships, setMemberships] = useState<any[]>([]);
  const [pendingMemberships, setPendingMemberships] = useState<any[]>([]);
  const [displayName, setDisplayName] = useState("");
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
  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) { router.replace("/"); return; }
    setDisplayName(localStorage.getItem("displayName") ?? "");
    setForm(f => ({ ...f, name: randomLeagueName() }));
    loadMemberships();
  }, []);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) setProfileOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  async function loadMemberships() {
    try { setMemberships(await api("/memberships")); } catch {}
    try { setPendingMemberships(await api("/memberships/pending")); } catch {}
  }

  async function createLeague(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    try {
      const league = await api("/leagues", {
        method: "POST",
        body: JSON.stringify({
          name: form.name,
          weeklyAllowance: Number(form.weeklyAllowance),
          maxPlayers: Number(form.maxPlayers),
          isPublic: form.isPublic,
          maxPublicPlayers: Number(form.maxPublicPlayers),
          maxBetsPerWeek: form.maxBetsPerWeek !== "" ? Number(form.maxBetsPerWeek) : null,
          maxStakePerBet: form.maxStakePerBet !== "" ? Number(form.maxStakePerBet) : null,
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

  function logout() {
    localStorage.removeItem("token");
    localStorage.removeItem("userId");
    localStorage.removeItem("displayName");
    router.push("/");
  }

  const playerOptions = [4, 6, 8, 10, 12, 14, 16, 18, 20];

  return (
    <>
      {/* Nav */}
      <nav className="nav" style={{ padding: "0 24px" }}>
        <Link href="/" style={{ display: "flex", alignItems: "center", flexShrink: 0 }}>
          <img src="/grH9m01.svg" alt="FanMark" style={{ height: 28, width: 28, objectFit: "contain", objectFit: "contain" }} />
        </Link>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center" }}>
          <div ref={profileRef} style={{ position: "relative" }}>
            <button type="button" onClick={() => setProfileOpen(o => !o)}
              style={{ width: 32, height: 32, borderRadius: "50%", background: "var(--surface-3)", border: "1px solid var(--border-2)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-2)", cursor: "pointer", boxShadow: "none", padding: 0, flexShrink: 0 }}>
              <UserIcon />
            </button>
            {profileOpen && (
              <div style={{ position: "absolute", top: "calc(100% + 6px)", right: 0, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)", boxShadow: "var(--shadow-md)", minWidth: 140, zIndex: 500, overflow: "hidden" }}>
                <button type="button" onClick={() => { router.push("/settings"); setProfileOpen(false); }}
                  style={{ display: "block", width: "100%", textAlign: "left", padding: "9px 14px", background: "none", border: "none", cursor: "pointer", fontSize: "0.82rem", fontWeight: 500, color: "var(--text)", boxShadow: "none", borderRadius: 0, transition: "background 0.1s" }}
                  onMouseEnter={e => (e.currentTarget.style.background = "var(--surface-2)")}
                  onMouseLeave={e => (e.currentTarget.style.background = "none")}>
                  Settings
                </button>
                <div style={{ borderTop: "1px solid var(--border)" }} />
                <button type="button" onClick={logout}
                  style={{ display: "block", width: "100%", textAlign: "left", padding: "9px 14px", background: "none", border: "none", cursor: "pointer", fontSize: "0.82rem", fontWeight: 500, color: "var(--loss)", boxShadow: "none", borderRadius: 0, transition: "background 0.1s" }}
                  onMouseEnter={e => (e.currentTarget.style.background = "var(--surface-2)")}
                  onMouseLeave={e => (e.currentTarget.style.background = "none")}>
                  Log out
                </button>
              </div>
            )}
          </div>
        </div>
      </nav>

      {/* Content */}
      <div className="page-wide" style={{ display: "flex", flexDirection: "column", alignItems: "center", paddingTop: "5vh" }}>

        <div style={{ width: "100%", marginBottom: 16 }}>
          <div style={{ fontWeight: 900, fontSize: "1.1rem", letterSpacing: "-0.01em", color: "var(--text)" }}>My Leagues</div>
          {displayName && <div style={{ fontSize: "0.8rem", color: "var(--text-3)", fontWeight: 500, marginTop: 2 }}>{displayName}</div>}
        </div>

        {/* Leagues table + actions */}
        {(() => {
          const COLS = "2fr 1.5fr 0.85fr 1fr 0.6fr 1.1fr 0.75fr 0.65fr 0.75fr";
          const headers = ["League", "Your team", "Phase", "Balance", "Bets", "Standing", "Record", "Streak", "Win %"];
          const rows = [...memberships, ...pendingMemberships.map((m: any) => ({ ...m, _pending: true }))];
          const dash = <span style={{ color: "var(--text-3)" }}>—</span>;

          return (
            <div style={{ width: "100%", marginBottom: 24, border: "1px solid var(--border)", borderRadius: "var(--radius)", overflow: "hidden" }}>
              {rows.length > 0 && (
                <>
                  <div style={{ display: "grid", gridTemplateColumns: COLS, alignItems: "center", gap: 8, padding: "10px 20px 8px", borderBottom: "1px solid var(--border-2)" }}>
                    {headers.map((h, i) => (
                      <span key={h} style={{ fontSize: "0.65rem", fontWeight: 500, color: "var(--text-3)", textAlign: i >= 3 ? "right" : "left" }}>{h}</span>
                    ))}
                  </div>
                  {rows.map((m: any) => {
                    const isPending = !!m._pending;
                    const ctx = m.weekContext;
                    const wins: number = m.wins ?? 0;
                    const losses: number = m.losses ?? 0;
                    const ties: number = m.ties ?? 0;
                    const total = wins + losses + ties;
                    const winPct = total > 0 ? Math.round((wins / total) * 100) : null;
                    const streak: string | null = m.streak ?? null;
                    const streakColor = !streak ? "var(--text-3)" : streak[0] === "W" ? "var(--win)" : streak[0] === "L" ? "var(--loss)" : "var(--text-2)";
                    const playoffSize: number = m.league?.playoffSize ?? 999;
                    const inConsolation = ctx?.phase === "playoffs" && m.rank != null && m.rank > playoffSize;

                    let phaseText: string;
                    let phaseColor: string;
                    if (isPending) { phaseText = "Pending"; phaseColor = "var(--pending)"; }
                    else if (!ctx || ctx.phase === "waiting") { phaseText = "Lobby"; phaseColor = "var(--text-3)"; }
                    else if (ctx.phase === "ended") { phaseText = "Complete"; phaseColor = "var(--text-3)"; }
                    else if (inConsolation) { phaseText = "Consolation"; phaseColor = "var(--text-3)"; }
                    else if (ctx.phase === "playoffs") { phaseText = ctx.week != null ? `Playoffs · Wk ${ctx.week}` : "Playoffs"; phaseColor = "var(--pending)"; }
                    else { phaseText = ctx.week != null ? `Regular · Wk ${ctx.week}` : "Regular"; phaseColor = "var(--accent)"; }

                    return (
                      <div
                        key={m.id}
                        onClick={isPending ? undefined : () => router.push(`/leagues/${m.leagueId}`)}
                        style={{ display: "grid", gridTemplateColumns: COLS, alignItems: "center", gap: 8, padding: "10px 20px", borderBottom: "1px solid var(--border)", cursor: isPending ? "default" : "pointer", transition: "background 0.08s", opacity: isPending ? 0.6 : 1 }}
                        onMouseEnter={isPending ? undefined : e => { (e.currentTarget as HTMLDivElement).style.background = "var(--surface-2)"; }}
                        onMouseLeave={isPending ? undefined : e => { (e.currentTarget as HTMLDivElement).style.background = "transparent"; }}
                      >
                        {/* League */}
                        <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                          <div style={{ width: 3, height: 30, borderRadius: 2, background: m.helmetColor ?? "var(--border-2)", flexShrink: 0 }} />
                          <div style={{ fontWeight: 600, fontSize: "0.82rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--text)" }}>
                            {m.league?.name}
                          </div>
                        </div>
                        {/* Your team */}
                        <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                          <HelmetAvatar color={m.helmetColor ?? "#02D18A"} initials={m.abbreviation || (m.displayName ?? "?").slice(0, 2)} size={26} />
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontSize: "0.78rem", fontWeight: 600, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {m.displayName || "—"}
                            </div>
                            {m.abbreviation && (
                              <div style={{ fontSize: "0.6rem", color: "var(--text-3)", fontWeight: 700, letterSpacing: "0.1em" }}>{m.abbreviation}</div>
                            )}
                          </div>
                        </div>
                        {/* Phase */}
                        <div style={{ fontSize: "0.78rem", fontWeight: 600, color: phaseColor, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {phaseText}
                        </div>
                        {/* Balance */}
                        <div style={{ display: "flex", justifyContent: isPending ? "center" : "flex-end", fontSize: "0.82rem", fontWeight: 600, color: isPending ? "var(--text-3)" : "var(--text)", fontVariantNumeric: "tabular-nums" }}>
                          {isPending ? dash : `$${(m.balance ?? 0).toLocaleString()}`}
                        </div>
                        {/* Bets */}
                        <div style={{ display: "flex", justifyContent: isPending ? "center" : "flex-end", fontSize: "0.82rem", fontWeight: 600, color: "var(--text)", fontVariantNumeric: "tabular-nums" }}>
                          {isPending ? dash : (m.betsThisWeek ?? 0)}
                        </div>
                        {/* Standing */}
                        <div style={{ display: "flex", justifyContent: (isPending || !m.rank) ? "center" : "flex-end", fontSize: "0.82rem", fontVariantNumeric: "tabular-nums" }}>
                          {isPending || !m.rank ? dash : (
                            <span>
                              <span style={{ fontWeight: 700, color: "var(--text)" }}>#{m.rank}</span>
                              <span style={{ fontWeight: 400, color: "var(--text-3)", fontSize: "0.72rem" }}> / {m.totalMembers}</span>
                            </span>
                          )}
                        </div>
                        {/* Record */}
                        <div style={{ display: "flex", justifyContent: (isPending || total === 0) ? "center" : "flex-end", fontSize: "0.82rem", fontWeight: 600, color: total > 0 ? "var(--text)" : "var(--text-3)", fontVariantNumeric: "tabular-nums" }}>
                          {isPending || total === 0 ? dash : `${wins}-${losses}${ties > 0 ? `-${ties}` : ""}`}
                        </div>
                        {/* Streak */}
                        <div style={{ display: "flex", justifyContent: (isPending || !streak) ? "center" : "flex-end", fontSize: "0.82rem", fontWeight: 700, color: streakColor, fontVariantNumeric: "tabular-nums" }}>
                          {isPending || !streak ? dash : streak}
                        </div>
                        {/* Win % */}
                        <div style={{ display: "flex", justifyContent: (isPending || winPct == null) ? "center" : "flex-end", fontSize: "0.82rem", fontWeight: 600, color: winPct != null ? "var(--text)" : "var(--text-3)", fontVariantNumeric: "tabular-nums" }}>
                          {isPending || winPct == null ? dash : `${winPct}%`}
                        </div>
                      </div>
                    );
                  })}
                </>
              )}

              {/* Action row */}
              <div style={{ display: "flex", borderTop: rows.length > 0 ? "1px solid var(--border-2)" : undefined }}>
                {([
                  { icon: <PlusIcon />, label: "Join Public", onClick: () => { joinPublic(); } },
                  { icon: <LockIcon />, label: "Join with Code", onClick: () => { setView(view === "private" ? "menu" : "private"); setJoinError(""); setJoinSuccess(""); } },
                  { icon: <PenIcon />, label: "Create League", onClick: () => { setView(view === "create" ? "menu" : "create"); setError(""); } },
                ] as const).map(({ icon, label, onClick }, idx) => (
                  <button
                    key={label}
                    onClick={onClick}
                    style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 5, padding: "14px 12px", background: "none", border: "none", borderLeft: idx > 0 ? "1px solid var(--border)" : "none", cursor: "pointer", color: "var(--text-3)", fontSize: "0.72rem", fontWeight: 600, letterSpacing: "0.01em", boxShadow: "none", borderRadius: 0, transition: "color 0.1s, background 0.1s" }}
                    onMouseEnter={e => { e.currentTarget.style.background = "var(--surface-2)"; e.currentTarget.style.color = "var(--text)"; }}
                    onMouseLeave={e => { e.currentTarget.style.background = "none"; e.currentTarget.style.color = "var(--text-3)"; }}
                  >
                    {icon}
                    {label}
                  </button>
                ))}
              </div>

              {/* Join with code form */}
              {view === "private" && (
                <div style={{ borderTop: "1px solid var(--border)", padding: "16px 20px" }}>
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
                <div style={{ borderTop: "1px solid var(--border)", padding: "10px 20px" }}>
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
