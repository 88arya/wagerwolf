"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { GoogleLogin } from "@react-oauth/google";
import { api } from "@/lib/api";
import HelmetAvatar, { HELMET_COLORS } from "@/components/HelmetAvatar";

const ACCENT = "#0070EB";


function ChevronDown() {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

function UserIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}

function HowToSection({ n, title, children }: { n: string; title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 7 }}>
        <span style={{ fontSize: "0.62rem", fontWeight: 800, color: ACCENT, background: "var(--accent-dim)", padding: "2px 7px", letterSpacing: "0.05em", flexShrink: 0 }}>
          {n}
        </span>
        <span style={{ fontWeight: 800, fontSize: "0.92rem" }}>{title}</span>
      </div>
      <div style={{ color: "var(--text-2)", fontSize: "0.84rem", lineHeight: 1.65, fontWeight: 500 }}>
        {children}
      </div>
    </div>
  );
}

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

export default function HomePage() {
  const router = useRouter();

  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [memberships, setMemberships] = useState<any[]>([]);
  const [pendingMemberships, setPendingMemberships] = useState<any[]>([]);

  const [showLeagues, setShowLeagues] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);

  const [modal, setModal] = useState(false);
  const [modalError, setModalError] = useState("");
  const [modalLoading, setModalLoading] = useState(false);

  const [view, setView] = useState<"menu" | "private" | "create">("menu");
  const [form, setForm] = useState({ name: "", weeklyAllowance: "300", maxPlayers: "10", isPublic: false, maxPublicPlayers: "0", maxBetsPerWeek: "", maxStakePerBet: "", startWeek: "1" });
  const [joinCode, setJoinCode] = useState("");
  const [error, setError] = useState("");
  const [joinError, setJoinError] = useState("");
  const [joinSuccess, setJoinSuccess] = useState("");
  const [authNag, setAuthNag] = useState("");

  const [profileSetup, setProfileSetup] = useState<{ leagueId: string; displayName: string; abbreviation: string; helmetColor: string; isPending: boolean } | null>(null);
  const [profileSaving, setProfileSaving] = useState(false);


  useEffect(() => {
    const token = localStorage.getItem("token");
    if (token) {
      setIsLoggedIn(true);
      setDisplayName(localStorage.getItem("displayName") ?? "");
      loadMemberships();
    }
    setForm(f => ({ ...f, name: randomLeagueName() }));
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

  function logout() {
    localStorage.removeItem("token");
    localStorage.removeItem("userId");
    localStorage.removeItem("displayName");
    setIsLoggedIn(false);
    setDisplayName("");
    setMemberships([]);
    setPendingMemberships([]);
    setProfileOpen(false);
  }

  function requireAuth(action: () => void) {
    if (!isLoggedIn) { setAuthNag("You must be logged in to do this."); return; }
    setAuthNag("");
    action();
  }

  function openModal() {
    setModalError(""); setModalLoading(false);
    setModal(true);
  }

  async function handleGoogleSuccess(credentialResponse: any) {
    setModalError(""); setModalLoading(true);
    try {
      const res = await api("/users/auth/google", { method: "POST", body: JSON.stringify({ credential: credentialResponse.credential }) });
      localStorage.setItem("token", res.token);
      localStorage.setItem("userId", res.userId);
      localStorage.setItem("displayName", res.displayName);
      setIsLoggedIn(true); setDisplayName(res.displayName); setModal(false);
      loadMemberships();
    } catch (err: any) {
      try { setModalError(JSON.parse(err.message).error); } catch { setModalError(err.message); }
      setModalLoading(false);
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
    e.preventDefault(); setJoinError(""); setJoinSuccess("");
    try {
      await api("/memberships/join-by-code", { method: "POST", body: JSON.stringify({ code: joinCode }) });
      setJoinCode(""); loadMemberships();
      setJoinSuccess("Request sent — waiting for commissioner approval.");
    } catch (err: any) {
      try { setJoinError(JSON.parse(err.message).error); } catch { setJoinError(err.message); }
    }
  }

  async function createLeague(e: React.FormEvent) {
    e.preventDefault(); setError("");
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
    } finally { setProfileSaving(false); }
  }

  const playerOptions = [4, 6, 8, 10, 12, 14, 16, 18, 20];

  return (
    <>
      {/* ── Navbar ── */}
      <nav className="nav" style={{ padding: "0 24px" }}>
        <div style={{ fontWeight: 900, fontSize: "1.05rem", letterSpacing: "0.07em", color: "var(--text)", textTransform: "uppercase", paddingRight: 20, marginRight: 4, flexShrink: 0 }}>
          PLAYBOOK
        </div>

        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
          {isLoggedIn && (
            <div
              style={{ position: "relative" }}
              onMouseEnter={() => setShowLeagues(true)}
              onMouseLeave={() => setShowLeagues(false)}
            >
              <button type="button" style={{ display: "flex", alignItems: "center", gap: 5, background: "none", border: "none", padding: "5px 8px", cursor: "pointer", color: "var(--text)", fontWeight: 500, fontSize: "0.82rem", borderRadius: 0, boxShadow: "none" }}>
                <span style={{ whiteSpace: "nowrap" }}>Your Leagues</span>
                <span style={{ color: "#000", flexShrink: 0, transform: showLeagues ? "rotate(180deg)" : "none", transition: "transform 0.15s" }}>
                  <ChevronDown />
                </span>
              </button>
              {showLeagues && (
                <div style={{ position: "absolute", top: "100%", right: 0, background: "var(--surface)", border: "5px solid #fff", borderRadius: 0, boxShadow: "var(--shadow-md)", minWidth: 240, zIndex: 500, overflow: "hidden" }}>
                  {memberships.length === 0 && pendingMemberships.length === 0 ? (
                    <div style={{ padding: "10px 14px", fontSize: "0.82rem", color: "#000" }}>No leagues yet</div>
                  ) : (
                    <>
                      {memberships.map((m: any) => (
                        <button key={m.id} type="button" onClick={() => router.push(`/leagues/${m.leagueId}`)}
                          style={{ display: "block", width: "100%", textAlign: "left", padding: "10px 14px", background: "none", border: "none", cursor: "pointer", boxShadow: "none", borderRadius: 0, color: "#000", transition: "background 0.1s, color 0.1s" }}
                          onMouseEnter={e => { e.currentTarget.style.background = ACCENT; e.currentTarget.style.color = "#fff"; }}
                          onMouseLeave={e => { e.currentTarget.style.background = "none"; e.currentTarget.style.color = "#000"; }}>
                          <div style={{ fontSize: "0.82rem", fontWeight: 500, marginBottom: 5 }}>{m.league?.name}</div>
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <HelmetAvatar color={m.helmetColor ?? ACCENT} initials={(m.displayName || displayName).slice(0, 2)} size={18} />
                            <span style={{ fontSize: "0.72rem", fontWeight: 500 }}>{m.displayName || displayName}</span>
                          </div>
                        </button>
                      ))}
                      {pendingMemberships.map((m: any) => (
                        <div key={m.id} style={{ padding: "10px 14px", opacity: 0.55 }}>
                          <div style={{ fontSize: "0.82rem", fontWeight: 500 }}>{m.league?.name}</div>
                          <div style={{ fontSize: "0.7rem", color: "var(--text-3)" }}>Pending approval</div>
                        </div>
                      ))}
                    </>
                  )}
                </div>
              )}
            </div>
          )}

          {!isLoggedIn ? (
            <div style={{ display: "flex", gap: 6 }}>
              <button type="button" onClick={openModal} className="ghost"
                style={{ padding: "6px 14px", fontSize: "0.82rem", fontWeight: 600, borderRadius: 0, height: 32 }}>
                Log In
              </button>
              <button type="button" onClick={openModal}
                style={{ padding: "6px 14px", fontSize: "0.82rem", fontWeight: 700, borderRadius: 0, height: 32 }}>
                Sign Up
              </button>
            </div>
          ) : (
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
          )}
        </div>
      </nav>

      {/* ── Body ── */}
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
        <div style={{ maxWidth: 920, margin: "0 auto", padding: "28px 24px 56px" }}>

          {/* ── Get Started card ── */}
          <div style={{ maxWidth: 300 }}>
              <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)", overflow: "hidden" }}>
                <div style={{ padding: "11px 16px", background: "var(--surface-2)", borderBottom: "1px solid var(--border)" }}>
                  <div style={{ fontSize: "0.63rem", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.12em", color: "var(--text-3)" }}>
                    {isLoggedIn ? "Play" : "Get Started"}
                  </div>
                </div>
                <div style={{ padding: "18px 16px" }}>

                  {view === "menu" && (
                    <>
                      {authNag && (
                        <div style={{ marginBottom: 14, padding: "10px 12px", background: "var(--loss-bg)", border: "1px solid var(--loss-border)", borderRadius: "var(--radius-sm)", color: "var(--loss)", fontSize: "0.8rem", fontWeight: 700 }}>
                          {authNag}{" "}
                          <span onClick={openModal} style={{ textDecoration: "underline", cursor: "pointer" }}>Log in</span>
                          {" or "}
                          <span onClick={openModal} style={{ textDecoration: "underline", cursor: "pointer" }}>sign up</span>.
                        </div>
                      )}
                      <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                        <button onClick={() => requireAuth(joinPublic)} style={{ width: "100%", padding: "10px", fontSize: "0.88rem", fontWeight: 700, borderRadius: "var(--radius-sm)" }}>
                          Join Public League
                        </button>
                        <button className="secondary" onClick={() => requireAuth(() => { setView("private"); setJoinError(""); setJoinSuccess(""); })}
                          style={{ width: "100%", padding: "10px", fontSize: "0.88rem", fontWeight: 700, borderRadius: "var(--radius-sm)" }}>
                          Join with Invite Code
                        </button>
                        <button className="secondary" onClick={() => requireAuth(() => { setView("create"); setError(""); })}
                          style={{ width: "100%", padding: "10px", fontSize: "0.88rem", fontWeight: 700, borderRadius: "var(--radius-sm)" }}>
                          Create a League
                        </button>
                      </div>
                      {joinError && <p className="error" style={{ marginTop: 12 }}>{joinError}</p>}
                      {joinSuccess && (
                        <div style={{ marginTop: 12, background: "var(--win-bg)", border: "1px solid var(--win-border)", borderRadius: "var(--radius-sm)", padding: "9px 12px", color: "var(--win)", fontSize: "0.82rem", fontWeight: 800 }}>
                          {joinSuccess}
                        </div>
                      )}
                    </>
                  )}

                  {view === "private" && (
                    <>
                      <button className="ghost" onClick={() => { setView("menu"); setJoinError(""); setJoinSuccess(""); }}
                        style={{ borderRadius: "var(--radius-sm)", padding: "5px 10px", fontSize: "0.78rem", marginBottom: 18, display: "flex", alignItems: "center", gap: 5, fontWeight: 700 }}>
                        ‹ Back
                      </button>
                      <div style={{ fontSize: "0.9rem", fontWeight: 800, marginBottom: 14 }}>Enter invite code</div>
                      <form onSubmit={joinPrivate} style={{ display: "flex", gap: 8 }}>
                        <input placeholder="ABC123" value={joinCode} onChange={e => setJoinCode(e.target.value.toUpperCase())} maxLength={6}
                          style={{ flex: 1, textTransform: "uppercase", letterSpacing: "0.3em", fontWeight: 900, textAlign: "center", fontSize: "1.3rem", color: ACCENT, padding: "10px 8px" }} required />
                        <button type="submit" style={{ padding: "0 18px", fontWeight: 800, fontSize: "1.2rem", flexShrink: 0 }}>›</button>
                      </form>
                      {joinError && <p className="error" style={{ marginTop: 10 }}>{joinError}</p>}
                      {joinSuccess && <div style={{ marginTop: 10, background: "var(--win-bg)", border: "1px solid var(--win-border)", borderRadius: "var(--radius-sm)", padding: "9px 12px", color: "var(--win)", fontSize: "0.82rem", fontWeight: 800 }}>{joinSuccess}</div>}
                    </>
                  )}

                  {view === "create" && (
                    <>
                      <button className="ghost" onClick={() => { setView("menu"); setError(""); }}
                        style={{ borderRadius: "var(--radius-sm)", padding: "5px 10px", fontSize: "0.78rem", marginBottom: 18, display: "flex", alignItems: "center", gap: 5, fontWeight: 700 }}>
                        ‹ Back
                      </button>
                      <div style={{ fontSize: "0.9rem", fontWeight: 800, marginBottom: 16 }}>New League</div>
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
                                  style={{ padding: "5px 11px", borderRadius: "var(--radius-sm)", fontSize: "0.82rem", fontWeight: active ? 800 : 600, background: active ? ACCENT : "var(--surface-2)", color: active ? "#fff" : "var(--text-2)", border: active ? `1.5px solid ${ACCENT}` : "1.5px solid var(--border-2)" }}>
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
                                  style={{ flex: 1, padding: "8px", borderRadius: "var(--radius-sm)", fontSize: "0.82rem", fontWeight: active ? 800 : 600, background: active ? ACCENT : "var(--surface-2)", color: active ? "#fff" : "var(--text-2)", border: active ? `1.5px solid ${ACCENT}` : "1.5px solid var(--border-2)" }}>
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
                        <button type="submit" style={{ width: "100%", padding: "11px", fontSize: "0.88rem", fontWeight: 700 }}>Create League</button>
                      </form>
                    </>
                  )}
                </div>
              </div>
            </div>

          {/* ── How to Play ── */}
          <div style={{ marginTop: 48, paddingTop: 40, borderTop: "1px solid var(--border)" }}>
            <div style={{ fontSize: "0.63rem", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.12em", color: "var(--text-3)", marginBottom: 6 }}>
              How to Play
            </div>
            <p style={{ fontSize: "0.84rem", color: "var(--text-2)", fontWeight: 500, marginBottom: 28 }}>
              Fantasy football format, NFL sportsbook scoring. Fake money, real stakes.
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 48px" }}>
              <HowToSection n="1" title="Join a League">
                <p>Create a private league and invite friends, or drop into a public one. Leagues run the full NFL season.</p>
              </HowToSection>
              <HowToSection n="2" title="Get Your Weekly Budget">
                <p>Each week your balance resets to the league allowance. That's your bankroll — bet it on any games that week.</p>
              </HowToSection>
              <HowToSection n="3" title="Bet Props & Game Lines">
                <p>Pick player props (over/under on yards, TDs, receptions) or game lines (spread, total, moneyline). Set your stake and submit.</p>
              </HowToSection>
              <HowToSection n="4" title="Parlay for Bigger Payouts">
                <p>Stack multiple bets into a parlay. All legs must hit, but the odds multiply — higher risk, higher reward.</p>
              </HowToSection>
              <HowToSection n="5" title="Head-to-Head Matchup">
                <p>Each week you're paired against one opponent. Whoever profits more that week wins the matchup.</p>
              </HowToSection>
              <HowToSection n="6" title="Playoffs & Champion">
                <p>Top records advance after the regular season. Win the bracket, win the league.</p>
              </HowToSection>
            </div>
            <div style={{ marginTop: 24, paddingTop: 20, borderTop: "1px solid var(--border)" }}>
              <p style={{ color: "var(--text-3)", fontSize: "0.78rem", fontWeight: 600 }}>
                All money is fake. For entertainment only.
              </p>
            </div>
          </div>

        </div>
      </div>

      {/* ── Auth Modal ── */}
      {modal && (
        <div onClick={() => setModal(false)} style={{ position: "fixed", inset: 0, zIndex: 100, background: "rgba(0,0,0,0.45)", backdropFilter: "blur(6px)", display: "flex", alignItems: "center", justifyContent: "center", padding: "32px 24px" }}>
          <div onClick={e => e.stopPropagation()} style={{ width: 360, background: "var(--surface)", borderRadius: "var(--radius-lg)", border: "1px solid var(--border-2)", overflow: "hidden", position: "relative" }}>
            <button onClick={() => setModal(false)} style={{ position: "absolute", top: 14, right: 16, background: "none", border: "none", cursor: "pointer", fontSize: "1.1rem", color: "var(--text-3)", lineHeight: 1, padding: 4 }}>✕</button>
            <div style={{ padding: "32px 28px 28px", display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
              <div style={{ fontWeight: 900, fontSize: "1.3rem", letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--text)", marginBottom: 4 }}>
                PLAYBOOK
              </div>
              <div style={{ fontSize: "0.82rem", color: "var(--text-3)", fontWeight: 500, marginBottom: 16 }}>
                Sign in to play
              </div>
              {modalError && <p className="error" style={{ width: "100%", textAlign: "center" }}>{modalError}</p>}
              <GoogleLogin onSuccess={handleGoogleSuccess} onError={() => setModalError("Google sign-in failed")} width="304" />
            </div>
          </div>
        </div>
      )}

      {/* ── Profile setup modal ── */}
      {profileSetup && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div className="card" style={{ width: "100%", maxWidth: 380, padding: 20 }}>
            <div style={{ fontWeight: 800, fontSize: "1rem", marginBottom: 4 }}>Set up your league profile</div>
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
                    style={{ width: 32, height: 32, borderRadius: "50%", background: color, border: profileSetup.helmetColor === color ? "3px solid var(--text)" : "3px solid transparent", padding: 0, cursor: "pointer", flexShrink: 0 }} />
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
