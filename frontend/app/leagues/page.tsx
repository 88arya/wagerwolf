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
      <div className="page" style={{ display: "flex", flexDirection: "column", alignItems: "center", paddingTop: "5vh" }}>

        <div style={{ width: "100%", maxWidth: 460, marginBottom: 20 }}>
          <div style={{ fontWeight: 900, fontSize: "1.1rem", letterSpacing: "-0.01em", color: "var(--text)" }}>My Leagues</div>
          {displayName && <div style={{ fontSize: "0.8rem", color: "var(--text-3)", fontWeight: 500, marginTop: 2 }}>{displayName}</div>}
        </div>

        {/* Leagues list */}
        {(memberships.length > 0 || pendingMemberships.length > 0) && (
          <div style={{ width: "100%", maxWidth: 460, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)", overflow: "hidden", marginBottom: 20 }}>
            {memberships.map((m: any) => (
              <Link key={m.id} href={`/leagues/${m.leagueId}`} style={{ textDecoration: "none" }}>
                <div
                  style={{ padding: "13px 16px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, cursor: "pointer", transition: "background 0.1s" }}
                  onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.background = "var(--surface-2)"; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = ""; }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: "0.88rem", marginBottom: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--text)" }}>
                      {m.league?.name}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ background: "var(--accent-dim)", color: "var(--accent)", borderRadius: 20, padding: "2px 9px", fontSize: "0.72rem", fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>
                        ${m.balance.toLocaleString()}
                      </span>
                      <span style={{ color: "var(--text-3)", fontSize: "0.7rem", fontWeight: 600 }}>
                        ${m.league?.weeklyAllowance}/wk
                      </span>
                      {m.league?.isPublic && <span className="badge badge-blue">Public</span>}
                    </div>
                  </div>
                  <span style={{ color: "var(--text-3)", fontSize: "1.1rem", fontWeight: 300, flexShrink: 0 }}>›</span>
                </div>
              </Link>
            ))}

            {pendingMemberships.map((m: any) => (
              <div key={m.id} style={{ padding: "13px 16px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, opacity: 0.6 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: "0.88rem", marginBottom: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--text)" }}>
                    {m.league?.name}
                  </div>
                  <div style={{ fontSize: "0.7rem", color: "var(--text-3)", fontWeight: 600 }}>Waiting for commissioner</div>
                </div>
                <span className="badge badge-yellow">Pending</span>
              </div>
            ))}
          </div>
        )}

        {/* Join / Create card */}
        <div style={{ width: "100%", maxWidth: 460, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)", overflow: "hidden" }}>
          <div style={{ padding: "11px 16px", background: "var(--surface-2)", borderBottom: "1px solid var(--border)" }}>
            <div style={{ fontSize: "0.6rem", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.14em", color: "var(--text-3)" }}>
              {view === "create" ? "New League" : view === "private" ? "Join by Code" : "Join or Create"}
            </div>
          </div>
          <div style={{ padding: "20px 18px" }}>

            {view === "menu" && (
              <>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <button onClick={joinPublic} style={{ width: "100%", padding: "11px", fontSize: "0.9rem", fontWeight: 700 }}>
                    Join Public League
                  </button>
                  <button className="secondary" onClick={() => { setView("private"); setJoinError(""); setJoinSuccess(""); }}
                    style={{ width: "100%", padding: "11px", fontSize: "0.9rem", fontWeight: 700 }}>
                    Join with Invite Code
                  </button>
                  <button className="secondary" onClick={() => { setView("create"); setError(""); }}
                    style={{ width: "100%", padding: "11px", fontSize: "0.9rem", fontWeight: 700 }}>
                    Create a League
                  </button>
                </div>
                {joinError && <p className="error" style={{ marginTop: 12 }}>{joinError}</p>}
                {joinSuccess && (
                  <div style={{ marginTop: 12, background: "var(--win-bg)", border: "1px solid var(--win-border)", borderRadius: "var(--radius-sm)", padding: "9px 12px", color: "var(--win)", fontSize: "0.82rem", fontWeight: 700 }}>
                    {joinSuccess}
                  </div>
                )}
              </>
            )}

            {view === "private" && (
              <>
                <button className="ghost" onClick={() => { setView("menu"); setJoinError(""); setJoinSuccess(""); }}
                  style={{ padding: "5px 10px", fontSize: "0.78rem", marginBottom: 18, display: "flex", alignItems: "center", gap: 5, fontWeight: 700 }}>
                  ‹ Back
                </button>
                <div style={{ fontSize: "0.88rem", fontWeight: 800, marginBottom: 14, color: "var(--text)" }}>Enter invite code</div>
                <form onSubmit={joinPrivate} style={{ display: "flex", gap: 8 }}>
                  <input placeholder="ABC123" value={joinCode} onChange={e => setJoinCode(e.target.value.toUpperCase())} maxLength={6}
                    style={{ flex: 1, textTransform: "uppercase", letterSpacing: "0.3em", fontWeight: 900, textAlign: "center", fontSize: "1.3rem", color: "var(--accent)", padding: "10px 8px" }} required />
                  <button type="submit" style={{ padding: "0 18px", fontWeight: 800, fontSize: "1.2rem", flexShrink: 0 }}>›</button>
                </form>
                {joinError && <p className="error" style={{ marginTop: 10 }}>{joinError}</p>}
                {joinSuccess && <div style={{ marginTop: 10, background: "var(--win-bg)", border: "1px solid var(--win-border)", borderRadius: "var(--radius-sm)", padding: "9px 12px", color: "var(--win)", fontSize: "0.82rem", fontWeight: 700 }}>{joinSuccess}</div>}
              </>
            )}

            {view === "create" && (
              <>
                <button className="ghost" onClick={() => { setView("menu"); setError(""); }}
                  style={{ padding: "5px 10px", fontSize: "0.78rem", marginBottom: 18, display: "flex", alignItems: "center", gap: 5, fontWeight: 700 }}>
                  ‹ Back
                </button>
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
              </>
            )}

          </div>
        </div>

      </div>

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
