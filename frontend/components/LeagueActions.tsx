"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { toCents } from "@/lib/money";
import HelmetAvatar, { HELMET_COLORS } from "@/components/HelmetAvatar";
import QuickJoin from "@/components/QuickJoin";
import { LEAGUE_LEVELS } from "@/lib/geo";

/**
 * The three ways into a league — assignment, invite code, create — as one
 * self-contained set of sheets that any control can mount.
 *
 * WHY THIS EXISTS. All three used to live inside components/LeaguesRail, and
 * lib/leagueActions was the channel that let the sidebar reach them: it
 * recorded which action you asked for, sent you to /home, and let the rail
 * pick it up on arrival. That indirection is gone, and so is the file.
 *
 * The argument for it was that the rail already owned these forms and shared
 * one membership list with them, so the sidebar could not own them without a
 * second copy. That was true while the rail was mounted. It stopped being true
 * when the rail came off /home: there is no other copy to conflict with, and —
 * more to the point — only the rail's LIST and its My Leagues table ever read
 * that membership state. These three sheets never read it. They only write,
 * and a write needs a callback, not shared state.
 *
 * So the control and the thing it controls are the same component now. That is
 * the same correction this codebase already made for LeagueProfileModal, which
 * LeagueNav mounts for exactly this reason — see CLAUDE.md -> League profile
 * editor. It also means these work from EVERY route rather than only from
 * /home, which the round trip could never manage.
 *
 * ON SUCCESS it dispatches LEAGUES_CHANGED rather than calling into anyone.
 * Whoever is showing a membership list can listen; nobody has to. Mirrors the
 * `league-profile-updated` event the profile modal already fires.
 */

export type LeagueAction = "public" | "private" | "create";

/** Fired after a join, a code redemption or a create. Detail is unused. */
export const LEAGUES_CHANGED = "leagues-changed";

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
  return `${loc} ${nick} League`;
}

const PLAYER_OPTIONS = [4, 6, 8, 10, 12, 14, 16, 18, 20];

function CloseButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" className="mx-sheet-close" onClick={onClick} aria-label="Close">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
      </svg>
    </button>
  );
}

export default function LeagueActions({
  action,
  onClose,
}: {
  /** Which sheet is open, or null for none. The mounting control owns this. */
  action: LeagueAction | null;
  onClose: () => void;
}) {
  const router = useRouter();

  const [form, setForm] = useState({
    name: "", weeklyAllowance: "300", maxPlayers: "10", isPublic: false,
    maxPublicPlayers: "0", maxBetsPerWeek: "", maxStakePerBet: "", startWeek: "1",
    // Beginner or pro. The only thing matchmaking will never compromise on,
    // and now the only thing a league is categorised by.
    skillLevel: "BEGINNER",
  });
  const [joinCode, setJoinCode] = useState("");
  const [error, setError] = useState("");
  const [joinError, setJoinError] = useState("");
  const [joinSuccess, setJoinSuccess] = useState("");
  const [profileSetup, setProfileSetup] = useState<{
    leagueId: string; displayName: string; abbreviation: string; helmetColor: string; isPending: boolean;
  } | null>(null);
  const [profileSaving, setProfileSaving] = useState(false);

  // A fresh suggestion per opening of the create sheet, so reopening it does
  // not stare back with the name you just declined.
  useEffect(() => {
    if (action === "create") setForm(f => ({ ...f, name: randomLeagueName() }));
  }, [action]);

  // Clear last time's outcome when a sheet opens. Without this, reopening
  // "Join with a code" still shows the notice from the previous redemption.
  useEffect(() => {
    if (action) { setError(""); setJoinError(""); setJoinSuccess(""); }
  }, [action]);

  // Esc closes, matching every other sheet on the site. The profile sheet is
  // deliberately excluded — it is the one step you should have to answer or
  // skip explicitly, since it is shown exactly once.
  useEffect(() => {
    if (!action) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [action, onClose]);

  function changed() {
    if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(LEAGUES_CHANGED));
  }

  /** Both API error shapes: a JSON body with `error`, or a bare message. */
  function readError(err: any): string {
    try { return JSON.parse(err.message).error; } catch { return err.message; }
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
          skillLevel: form.skillLevel,
        }),
      });
      const membership = await api(`/leagues/${league.id}/join`, { method: "POST", body: JSON.stringify({}) });
      changed();
      // Close the create sheet before opening the profile one. They are two
      // separate scrims, so leaving this open stacked one dimmed sheet on top
      // of another.
      onClose();
      setProfileSetup({ leagueId: league.id, displayName: membership.displayName, abbreviation: membership.abbreviation, helmetColor: membership.helmetColor, isPending: false });
    } catch (err: any) {
      setError(readError(err));
    }
  }

  // Joining is assignment, not selection: the QuickJoin sheet asks for a size
  // and a level and the server seats you. This is what happens once it reports
  // back.
  function handleJoined(membership: any) {
    setJoinError("");
    const name = membership?.league?.name ?? "the league";
    // Quick Join reports what it could not honour. A silent compromise is how
    // someone ends up in an 8-team league having asked for 12 and never finds
    // out why.
    const week = membership?.startWeek ? ` Starts NFL week ${membership.startWeek}.` : "";
    if (membership?.created) {
      setJoinSuccess(`Nothing open matched, so we started "${name}" with you as commissioner.${week} Share the invite code to fill it.`);
    } else if (membership?.relaxedSize) {
      setJoinSuccess(`Joined "${name}" — no league of the size you picked was open, so we widened it.${week}`);
    } else {
      setJoinSuccess(`Joined "${name}".${week}`);
    }
    changed();
  }

  async function joinPrivate(e: React.FormEvent) {
    e.preventDefault();
    setJoinError(""); setJoinSuccess("");
    try {
      await api("/memberships/join-by-code", { method: "POST", body: JSON.stringify({ code: joinCode }) });
      setJoinCode("");
      changed();
      setJoinSuccess("Request sent — waiting for commissioner approval.");
    } catch (err: any) {
      setJoinError(readError(err));
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
      changed();
      const wasPending = profileSetup.isPending;
      const leagueId = profileSetup.leagueId;
      setProfileSetup(null);
      if (wasPending) {
        setJoinSuccess("Request sent — waiting for commissioner approval.");
      } else {
        router.push(`/leagues/${leagueId}/members`);
      }
    } catch (err: any) {
      alert(readError(err));
    } finally {
      setProfileSaving(false);
    }
  }

  return (
    <>
      <QuickJoin open={action === "public"} onClose={onClose} onJoined={handleJoined} />

      {/* ── Invite code ────────────────────────────────────────────────
          This was an inline form inside the rail, revealed under the three
          buttons. As a sheet it can be opened from anywhere, which is the
          whole point of the move — and it is one field, so it stays narrow
          rather than borrowing the create sheet's width. */}
      {action === "private" && (
        <div className="mx-scrim" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
          <div className="mx-sheet" role="dialog" aria-modal="true" aria-label="Join with an invite code" style={{ maxWidth: 380 }}>
            <div className="mx-sheet-head">
              <span className="mx-sheet-title">Join with a code</span>
              <CloseButton onClick={onClose} />
            </div>

            <form className="mx-stack" onSubmit={joinPrivate}>
              <div>
                <label className="mx-label" htmlFor="lg-code">Invite code</label>
                <input
                  id="lg-code"
                  className="mx-field"
                  placeholder="ABC123"
                  value={joinCode}
                  onChange={e => setJoinCode(e.target.value.toUpperCase())}
                  maxLength={6}
                  autoFocus
                  required
                  style={{ textTransform: "uppercase", letterSpacing: "0.22em", fontWeight: 500, textAlign: "center", fontSize: "1rem", color: "var(--accent)" }}
                />
                <div style={{ fontSize: "0.72rem", color: "var(--text-3)", marginTop: 7, lineHeight: 1.4 }}>
                  Six characters, from the league&apos;s commissioner. Your request goes to them for approval.
                </div>
              </div>

              {joinError && <div className="mx-notice is-bad">{joinError}</div>}
              {joinSuccess && <div className="mx-notice is-good">{joinSuccess}</div>}

              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                <button type="button" className="mx-btn is-quiet" onClick={onClose}>Cancel</button>
                <button type="submit" className="mx-btn is-primary">Send request</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Create League ──────────────────────────────────────────────
          Built on `.mx-sheet` in the same hairline vocabulary as the rest of
          the chrome. The section that is genuinely new is "Level" — before it,
          a public league took literally anyone, which is the whole reason the
          finder could not offer a useful filter. */}
      {action === "create" && (
        <div className="mx-scrim" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
          <div className="mx-sheet" role="dialog" aria-modal="true" aria-label="Create league" style={{ maxWidth: 480 }}>
            <div className="mx-sheet-head">
              <span className="mx-sheet-title">Create a league</span>
              <CloseButton onClick={onClose} />
            </div>

            <form className="mx-stack" onSubmit={createLeague}>

              <div>
                <label className="mx-label" htmlFor="lg-name">League name</label>
                <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                  <input id="lg-name" className="mx-field" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required style={{ flex: 1 }} />
                  <button type="button" className="mx-btn is-quiet" onClick={() => setForm(f => ({ ...f, name: randomLeagueName() }))} title="Randomize" style={{ padding: "8px 10px", flexShrink: 0 }}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="23 4 23 10 17 10" /><polyline points="1 20 1 14 7 14" />
                      <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" />
                    </svg>
                  </button>
                </div>
              </div>

              <div>
                <span className="mx-label">Players</span>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {PLAYER_OPTIONS.map(n => (
                    <button key={n} type="button" className={`mx-chip${Number(form.maxPlayers) === n ? " is-on" : ""}`} onClick={() => setForm({ ...form, maxPlayers: String(n) })}>
                      {n}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <span className="mx-label">Visibility</span>
                <div style={{ display: "flex", gap: 6 }}>
                  {([{ value: false, label: "Invite only" }, { value: true, label: "Public" }] as const).map(({ value, label }) => (
                    <button key={label} type="button" className={`mx-chip${form.isPublic === value ? " is-on" : ""}`} onClick={() => setForm({ ...form, isPublic: value })}>
                      {label}
                    </button>
                  ))}
                </div>
                <div style={{ fontSize: "0.72rem", color: "var(--text-3)", marginTop: 7, lineHeight: 1.4 }}>
                  {form.isPublic
                    ? "Players who pick this size and level can be matched straight into it."
                    : "Members join with your invite code and you approve each request. You can still open a few slots to matched players below."}
                </div>
              </div>

              {!form.isPublic && (
                <div>
                  <label className="mx-label" htmlFor="lg-fill">Open slots for strangers</label>
                  <input id="lg-fill" className="mx-field" type="number" min="0" max={Number(form.maxPlayers)} placeholder="0 — invite only" value={form.maxPublicPlayers} onChange={e => setForm({ ...form, maxPublicPlayers: e.target.value })} style={{ maxWidth: 130 }} />
                  <div style={{ fontSize: "0.72rem", color: "var(--text-3)", marginTop: 6 }}>
                    Above zero, matched players can fill these slots without an invite.
                  </div>
                </div>
              )}

              {/* ── Level ────────────────────────────────────────────────
                  All that is left of a "who can join" section that also
                  carried five skill tiers, a numeric experience range, a
                  country/region scope, a directory-listing toggle and a
                  description. Those existed to filter a browsable league list;
                  players are assigned now, so this is the only axis left. */}
              <div style={{ paddingTop: 4, borderTop: "1px solid var(--border)" }}>
                <div className="mx-section-title" style={{ marginTop: 14, marginBottom: 10 }}>Level</div>
                <div className="rg-2" style={{ display: "grid", gap: 8 }}>
                  {LEAGUE_LEVELS.map(l => {
                    const on = form.skillLevel === l.value;
                    return (
                      <button
                        key={l.value}
                        type="button"
                        onClick={() => setForm({ ...form, skillLevel: l.value })}
                        aria-pressed={on}
                        style={{
                          // whiteSpace normal overrides the global `button`
                          // nowrap; minWidth 0 stops the grid track blowing out.
                          textAlign: "left", whiteSpace: "normal", minWidth: 0,
                          padding: "12px 13px", borderRadius: "var(--radius-sm)",
                          border: `1px solid ${on ? "var(--accent)" : "var(--border-2)"}`,
                          background: on ? "var(--accent-dim)" : "transparent",
                          color: "var(--text)", cursor: "pointer", boxShadow: "none", transform: "none",
                        }}
                      >
                        <span style={{ display: "block", fontSize: "0.85rem", fontWeight: 500, color: on ? "var(--accent)" : "var(--text)" }}>
                          {l.label}
                        </span>
                        <span style={{ display: "block", fontSize: "0.72rem", color: "var(--text-3)", marginTop: 3, lineHeight: 1.35 }}>
                          {l.blurb}
                        </span>
                      </button>
                    );
                  })}
                </div>
                <div style={{ fontSize: "0.72rem", color: "var(--text-3)", marginTop: 8 }}>
                  Players choosing this level are matched into your league.
                </div>
              </div>

              {/* ── Season & stakes ──────────────────────────────────── */}
              <div style={{ paddingTop: 4, borderTop: "1px solid var(--border)" }}>
                <div className="mx-section-title" style={{ marginTop: 14, marginBottom: 10 }}>Season &amp; stakes</div>

                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  <div>
                    <label className="mx-label" htmlFor="lg-week">Start week</label>
                    <input id="lg-week" className="mx-field" type="number" min="1" max="17" value={form.startWeek} onChange={e => setForm({ ...form, startWeek: e.target.value })} required style={{ maxWidth: 100 }} />
                    <div style={{ fontSize: "0.72rem", color: "var(--text-3)", marginTop: 6 }}>The NFL week your season begins.</div>
                  </div>

                  <div>
                    <label className="mx-label" htmlFor="lg-allow">Weekly allowance ($)</label>
                    <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                      <button type="button" className="mx-btn is-quiet" onClick={() => setForm({ ...form, weeklyAllowance: String(Math.max(25, Number(form.weeklyAllowance) - 25)) })} style={{ width: 34, padding: 0, justifyContent: "center" }}>−</button>
                      <input id="lg-allow" className="mx-field" type="text" inputMode="numeric" value={form.weeklyAllowance}
                        onChange={e => setForm({ ...form, weeklyAllowance: e.target.value.replace(/[^0-9]/g, "") })}
                        style={{ textAlign: "center", maxWidth: 110, fontVariantNumeric: "tabular-nums" }} required />
                      <button type="button" className="mx-btn is-quiet" onClick={() => setForm({ ...form, weeklyAllowance: String(Number(form.weeklyAllowance) + 25) })} style={{ width: 34, padding: 0, justifyContent: "center" }}>+</button>
                    </div>
                  </div>

                  <div className="rg-2" style={{ display: "grid", gap: 10 }}>
                    <div>
                      <label className="mx-label" htmlFor="lg-maxbets">Max bets / week</label>
                      <input id="lg-maxbets" className="mx-field" type="number" min="1" placeholder="No limit" value={form.maxBetsPerWeek} onChange={e => setForm({ ...form, maxBetsPerWeek: e.target.value })} />
                    </div>
                    <div>
                      <label className="mx-label" htmlFor="lg-maxstake">Max stake / bet</label>
                      <input id="lg-maxstake" className="mx-field" type="number" min="1" placeholder="No limit" value={form.maxStakePerBet} onChange={e => setForm({ ...form, maxStakePerBet: e.target.value })} />
                    </div>
                  </div>
                </div>
              </div>

              {error && <div className="mx-notice is-bad">{error}</div>}

              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                <button type="button" className="mx-btn is-quiet" onClick={onClose}>Cancel</button>
                <button type="submit" className="mx-btn is-primary">Create league</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Quick Join outcome ─────────────────────────────────────────
          QuickJoin closes itself on success, so its result has no sheet left
          to live in. It is the one message here that has to outlive its own
          surface — a join that quietly widened your size preference is
          precisely what someone needs to be told, and the rail's inline
          notice used to be where it landed. */}
      {!action && !profileSetup && joinSuccess && (
        <div className="mx-scrim" onMouseDown={e => { if (e.target === e.currentTarget) setJoinSuccess(""); }}>
          <div className="mx-sheet" role="dialog" aria-modal="true" aria-label="Joined" style={{ maxWidth: 380 }}>
            <div className="mx-sheet-head">
              <span className="mx-sheet-title">You&apos;re in</span>
              <CloseButton onClick={() => setJoinSuccess("")} />
            </div>
            <div className="mx-stack">
              <div className="mx-notice is-good">{joinSuccess}</div>
              <div style={{ display: "flex", justifyContent: "flex-end" }}>
                <button type="button" className="mx-btn is-primary" onClick={() => setJoinSuccess("")}>Done</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Profile setup — shown once, straight after a league is created or a
          join request goes in. Same sheet vocabulary as LeagueProfileModal,
          which is what edits these three fields from then on. */}
      {profileSetup && (
        <div className="mx-scrim">
          <div className="mx-sheet" role="dialog" aria-modal="true" aria-label="League profile setup">
            <div className="mx-sheet-head">
              <div>
                <span className="mx-sheet-title">Set up your team</span>
                <div style={{ fontSize: "0.76rem", color: "var(--text-3)", marginTop: 4 }}>How you appear in this league.</div>
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 13, marginBottom: 20 }}>
              <HelmetAvatar color={profileSetup.helmetColor} initials={(profileSetup.abbreviation || profileSetup.displayName || "?").slice(0, 2)} size={42} />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: "0.9rem", fontWeight: 500, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {profileSetup.displayName || "Your team"}
                </div>
                <div style={{ fontSize: "0.66rem", letterSpacing: "0.14em", color: "var(--text-3)", marginTop: 3 }}>
                  {(profileSetup.abbreviation || "—").toUpperCase()}
                </div>
              </div>
            </div>

            <div className="mx-stack">
              <div>
                <label className="mx-label" htmlFor="ps-name">Team name</label>
                <input id="ps-name" className="mx-field" value={profileSetup.displayName} maxLength={30} onChange={e => setProfileSetup({ ...profileSetup, displayName: e.target.value })} />
              </div>

              <div>
                <label className="mx-label" htmlFor="ps-abbr">Abbreviation</label>
                <input id="ps-abbr" className="mx-field" value={profileSetup.abbreviation} maxLength={3}
                  onChange={e => setProfileSetup({ ...profileSetup, abbreviation: e.target.value.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 3) })}
                  style={{ maxWidth: 96, letterSpacing: "0.22em", textTransform: "uppercase" }} />
              </div>

              <div>
                <span className="mx-label">Helmet colour</span>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {HELMET_COLORS.map(color => (
                    <button key={color} type="button" aria-label={color} aria-pressed={profileSetup.helmetColor === color}
                      onClick={() => setProfileSetup({ ...profileSetup, helmetColor: color })}
                      style={{
                        width: 26, height: 26, padding: 0, borderRadius: "var(--radius-sm)", background: color,
                        border: "none", boxShadow: "none", transform: "none", cursor: "pointer", flexShrink: 0,
                        outline: profileSetup.helmetColor === color ? "2px solid var(--accent)" : "2px solid transparent",
                        outlineOffset: 2,
                      }} />
                  ))}
                </div>
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                <button type="button" className="mx-btn is-quiet"
                  onClick={() => { const p = profileSetup; setProfileSetup(null); if (!p.isPending) router.push(`/leagues/${p.leagueId}/members`); }}>
                  Skip
                </button>
                <button type="button" className="mx-btn is-primary" disabled={profileSaving} onClick={saveProfile}>
                  {profileSaving ? "Saving…" : "Save"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
