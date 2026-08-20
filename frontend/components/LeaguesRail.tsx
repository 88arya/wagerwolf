"use client";

import { useEffect, useState } from "react";
import { Compass, Lock, Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { fmtMoney, toCents } from "@/lib/money";
import HelmetAvatar, { HELMET_COLORS } from "@/components/HelmetAvatar";
import QuickJoin from "@/components/QuickJoin";
import { LEAGUE_LEVELS } from "@/lib/geo";

/**
 * The leagues surface, as a right-hand rail.
 *
 * This was the whole of `/leagues` — a full-width page whose body was one wide
 * table. That page is gone: the utility bar already carried both "Home" and
 * "Leagues" as separate destinations, and the second one existed only to show
 * a list you consult occasionally and then leave. It is now a rail on /home,
 * and the table it used to *be* is a popup you open from the rail's header.
 *
 * Everything lives in this one component on purpose. The rail, the table, the
 * QuickJoin sheet, the create sheet and the first-run profile sheet all read
 * and write the same membership list, so splitting them would mean either
 * lifting all of that state into the page or refetching per surface. The page
 * itself stays a layout.
 */

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

/**
 * Where a membership sits in its season, as a state plus an optional week.
 * Shared by the rail and the table so the two can never disagree about what
 * "Upcoming" or "Eliminated" means.
 */
function phaseFor(m: any): { state: string; week: string | null; notStarted: boolean } {
  const isPending = !!m._pending;
  const ctx = m.weekContext;
  const notStarted = isPending || !ctx || ctx.phase === "waiting";

  if (isPending) return { state: "Pending", week: null, notStarted };
  if (!ctx || ctx.phase === "waiting") return { state: "Lobby", week: null, notStarted };
  if (ctx.phase === "ended") return { state: ctx.champion ? "Champion" : "Complete", week: null, notStarted };
  if (ctx.phase === "preseason") {
    return { state: "Upcoming", week: ctx.startsNflWeek != null ? `NFL Wk ${ctx.startsNflWeek}` : null, notStarted };
  }
  if (ctx.phase === "playoffs") {
    return {
      state: ctx.alive === false ? "Eliminated" : "Playoffs",
      week: ctx.alive !== false && ctx.week != null ? `Rd ${ctx.week}${ctx.total ? `/${ctx.total}` : ""}` : null,
      notStarted,
    };
  }
  return { state: "Regular", week: ctx.week != null ? `Wk ${ctx.week}${ctx.total ? `/${ctx.total}` : ""}` : null, notStarted };
}

export default function LeaguesRail() {
  const router = useRouter();
  const [memberships, setMemberships] = useState<any[]>([]);
  const [pendingMemberships, setPendingMemberships] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [form, setForm] = useState({
    name: "", weeklyAllowance: "300", maxPlayers: "10", isPublic: false,
    maxPublicPlayers: "0", maxBetsPerWeek: "", maxStakePerBet: "", startWeek: "1",
    // Beginner or pro. The only thing matchmaking will never compromise on,
    // and now the only thing a league is categorised by.
    skillLevel: "BEGINNER",
  });
  // The old page's wide table, now behind the rail's header.
  const [tableOpen, setTableOpen] = useState(false);
  const [finderOpen, setFinderOpen] = useState(false);
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
    setForm(f => ({ ...f, name: randomLeagueName() }));
    loadMemberships();
  }, []);

  // Esc closes the table, matching every other sheet on the site.
  useEffect(() => {
    if (!tableOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setTableOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [tableOpen]);

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
          skillLevel: form.skillLevel,
        }),
      });
      const membership = await api(`/leagues/${league.id}/join`, { method: "POST", body: JSON.stringify({}) });
      // Close the create sheet before opening the profile one. They are two
      // separate scrims, so leaving this open stacked one dimmed sheet on top
      // of another.
      setView("menu");
      setProfileSetup({ leagueId: league.id, displayName: membership.displayName, abbreviation: membership.abbreviation, helmetColor: membership.helmetColor, isPending: false });
    } catch (err: any) {
      try { setError(JSON.parse(err.message).error); } catch { setError(err.message); }
    }
  }

  // Joining is assignment, not selection: the QuickJoin sheet asks for a size
  // and a level and the server seats you. This is what happens once it reports
  // back.
  function handleJoined(membership: any) {
    setFinderOpen(false);
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
    loadMemberships();
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
  const rows = [...memberships, ...pendingMemberships.map((m: any) => ({ ...m, _pending: true }))];
  const dash = <span style={{ color: "var(--text-3)" }}>—</span>;

  return (
    <>
      {/* ── The rail ──────────────────────────────────────────────────
          Header is a button, not a heading: it is the only way into the
          table, so it has to be obviously clickable. */}
      <aside style={{ minWidth: 0 }}>
        <button
          type="button"
          className="mx-btn is-bare"
          onClick={() => setTableOpen(true)}
          style={{
            width: "100%", justifyContent: "space-between", padding: "0 0 9px",
            borderBottom: "1px solid var(--border-2)", borderRadius: 0,
          }}
          aria-haspopup="dialog"
        >
          <span className="mx-section-title" style={{ margin: 0 }}>Leagues</span>
          <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: "0.68rem", color: "var(--text-3)" }}>
            {!loading && rows.length > 0 && rows.length}
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </span>
        </button>

        {loading && (
          <div style={{ padding: "18px 0", fontSize: "0.76rem", color: "var(--text-3)" }}>Loading…</div>
        )}

        {!loading && loadError && (
          <div style={{ padding: "16px 0" }}>
            <div style={{ fontSize: "0.78rem", color: "var(--text-2)", marginBottom: 8 }}>Couldn't load your leagues</div>
            <button type="button" className="mx-btn is-quiet" onClick={() => { setLoading(true); loadMemberships(); }}>Retry</button>
          </div>
        )}

        {!loading && !loadError && rows.length === 0 && (
          <div style={{ padding: "18px 0", fontSize: "0.76rem", color: "var(--text-3)", lineHeight: 1.55 }}>
            No leagues yet. Join one, enter an invite code, or create your own.
          </div>
        )}

        {!loading && !loadError && rows.length > 0 && (
          <div>
            {rows.map((m: any) => {
              const isPending = !!m._pending;
              const { state, week } = phaseFor(m);
              const go = () => router.push(`/leagues/${m.leagueId}`);
              return (
                <div
                  key={m.id}
                  onClick={isPending ? undefined : go}
                  tabIndex={isPending ? undefined : 0}
                  onKeyDown={isPending ? undefined : e => { if (e.key === "Enter") go(); }}
                  style={{
                    display: "flex", alignItems: "center", gap: 9,
                    padding: "10px 0", borderBottom: "1px solid var(--border)",
                    cursor: isPending ? "default" : "pointer",
                    opacity: isPending ? 0.6 : 1,
                    transition: "background 0.08s", minWidth: 0,
                  }}
                  onMouseEnter={isPending ? undefined : e => { (e.currentTarget as HTMLDivElement).style.background = "var(--surface-2)"; }}
                  onMouseLeave={isPending ? undefined : e => { (e.currentTarget as HTMLDivElement).style.background = "transparent"; }}
                >
                  <div style={{ width: 4, height: 26, background: m.helmetColor ?? "var(--border-2)", flexShrink: 0 }} />
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: "0.78rem", fontWeight: 500, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {m.league?.name}
                    </div>
                    <div style={{ fontSize: "0.66rem", color: "var(--text-3)", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {week ? `${state} · ${week}` : state}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Actions. Same three the old page header carried. */}
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 14 }}>
          <button type="button" className="mx-btn is-quiet" style={{ justifyContent: "flex-start" }}
            onClick={() => { setView("menu"); setJoinError(""); setJoinSuccess(""); setFinderOpen(true); }}>
            <Compass size={13} /> Join a league
          </button>
          <button type="button" className="mx-btn is-quiet" style={{ justifyContent: "flex-start" }}
            onClick={() => { setView(view === "private" ? "menu" : "private"); setJoinError(""); setJoinSuccess(""); }}>
            <Lock size={13} /> Invite code
          </button>
          <button type="button" className="mx-btn is-primary" style={{ justifyContent: "flex-start" }}
            onClick={() => { setView(view === "create" ? "menu" : "create"); setError(""); }}>
            <Plus size={13} /> Create league
          </button>
        </div>

        {/* Join with code form */}
        {view === "private" && (
          <div style={{ marginTop: 12 }}>
            <form onSubmit={joinPrivate} style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <input
                placeholder="INVITE CODE"
                value={joinCode}
                onChange={e => setJoinCode(e.target.value.toUpperCase())}
                maxLength={6}
                autoFocus
                required
                style={{ flex: 1, minWidth: 0, textTransform: "uppercase", letterSpacing: "0.22em", fontWeight: 500, textAlign: "center", fontSize: "0.92rem", color: "var(--accent)", padding: "8px" }}
              />
              <button type="submit" className="mx-btn is-quiet" style={{ padding: "0 12px", height: 34, flexShrink: 0 }}>›</button>
            </form>
          </div>
        )}

        {/* Join feedback — shared by the code form and Quick Join. */}
        {(joinError || joinSuccess) && (
          <div style={{ marginTop: 10 }}>
            {joinError && <div className="mx-notice is-bad">{joinError}</div>}
            {joinSuccess && <div className="mx-notice is-good">{joinSuccess}</div>}
          </div>
        )}
      </aside>

      {/* ── The table ─────────────────────────────────────────────────
          Verbatim the old page's body. `.mx-sheet` caps at 400px, which
          nine numeric columns cannot live in, so the cap is raised here
          rather than in globals — nothing else needs a sheet this wide. */}
      {tableOpen && (
        <div className="mx-scrim" onMouseDown={e => { if (e.target === e.currentTarget) setTableOpen(false); }}>
          <div className="mx-sheet" role="dialog" aria-modal="true" aria-label="My leagues" style={{ maxWidth: 1100 }}>
            <div className="mx-sheet-head">
              <div>
                <span className="mx-sheet-title">My Leagues</span>
                <div style={{ fontSize: "0.76rem", color: "var(--text-3)", marginTop: 4 }}>
                  Every league you play in, and the ones open to you.
                </div>
              </div>
              <button type="button" className="mx-sheet-close" onClick={() => setTableOpen(false)} aria-label="Close">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            {(() => {
              const TH = { fontSize: "0.65rem", fontWeight: 500, color: "var(--text-3)", padding: "10px 12px 8px", borderBottom: "1px solid var(--border-2)", whiteSpace: "nowrap" as const, overflow: "hidden" as const, textAlign: "left" as const, background: "transparent" };
              const THC = { ...TH, textAlign: "center" as const };
              const TD = { fontSize: "0.78rem", fontWeight: 400, color: "var(--text)", padding: "10px 12px", borderTop: "1px solid var(--border)", fontVariantNumeric: "tabular-nums" as const, whiteSpace: "nowrap" as const, overflow: "hidden" as const };
              const TDR = { ...TD, textAlign: "right" as const };
              const TDC = { ...TD, textAlign: "center" as const };
              const MINI = { fontSize: "0.6rem", fontWeight: 500, letterSpacing: "0.08em", color: "var(--text-3)", textTransform: "uppercase" as const };

              if (loading) return <div className="mx-empty">Loading leagues…</div>;
              if (loadError) return (
                <div className="mx-empty">
                  Couldn't load your leagues
                  <div style={{ marginTop: 12 }}>
                    <button type="button" className="mx-btn is-quiet" onClick={() => { setLoading(true); loadMemberships(); }}>Retry</button>
                  </div>
                </div>
              );
              if (rows.length === 0) return (
                <div className="mx-empty">
                  No leagues yet
                  <div style={{ fontSize: "0.75rem", marginTop: 4 }}>Join a league, enter an invite code, or create your own</div>
                </div>
              );

              return (
                // Nine numeric columns will not fit a narrow window; the table
                // scrolls inside the sheet rather than forcing the sheet wider.
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", minWidth: 860, borderCollapse: "collapse", tableLayout: "fixed" }}>
                    <colgroup>
                      <col style={{ width: "23%" }} />
                      <col style={{ width: "11%" }} />
                      <col style={{ width: "10%" }} />
                      <col style={{ width: "14%" }} />
                      <col style={{ width: "8%" }} />
                      <col style={{ width: "8%" }} />
                      <col style={{ width: "8%" }} />
                      <col style={{ width: "7%" }} />
                      <col style={{ width: "7%" }} />
                      <col style={{ width: "4%" }} />
                    </colgroup>
                    <thead>
                      <tr>
                        <th style={TH}>LEAGUE</th>
                        <th style={TH}>YOU</th>
                        <th style={TH}>PHASE</th>
                        <th style={THC}>AVAILABLE BALANCE</th>
                        <th style={THC}>ACTIVE BETS</th>
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
                      const { state: phaseState, week: phaseWeek, notStarted } = phaseFor(m);
                      const wins: number = m.wins ?? 0;
                      const losses: number = m.losses ?? 0;
                      const ties: number = m.ties ?? 0;
                      const total = wins + losses + ties;
                      const winPct = total > 0 ? Math.round(((wins + ties / 2) / total) * 100) : null;
                      const streak: string | null = m.streak ?? null;
                      const goToLeague = () => router.push(`/leagues/${m.leagueId}`);

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
                                <span style={{ fontWeight: 500, fontSize: "0.82rem", color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis" }}>{m.league?.name}</span>
                              ) : (
                                <Link href={`/leagues/${m.leagueId}`} onClick={e => e.stopPropagation()}
                                  style={{ fontWeight: 500, fontSize: "0.82rem", color: "var(--text)", textDecoration: "none", overflow: "hidden", textOverflow: "ellipsis" }}>
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
                          <td style={TDC}>{notStarted ? dash : fmtMoney(m.balance ?? 0)}</td>
                          {/* Active bets this week */}
                          <td style={TDC}>{notStarted ? dash : (m.betsThisWeek ?? 0)}</td>
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
                            {!isPending && (
                              <svg width="18" height="18" viewBox="0 0 24 24" style={{ display: "inline-block", color: "var(--text-3)" }}>
                                <path d="M0 0h24v24H0z" fill="none" />
                                <path fill="currentColor" d="M8 5.14v14l11-7z" />
                              </svg>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                    </tbody>
                  </table>
                </div>
              );
            })()}
          </div>
        </div>
      )}

      <QuickJoin open={finderOpen} onClose={() => setFinderOpen(false)} onJoined={handleJoined} />

      {/* ── Create League ──────────────────────────────────────────────
          Rebuilt on `.mx-sheet` rather than a `.card` in a hand-rolled scrim,
          in the same hairline vocabulary as the rest of the chrome. The
          section that is genuinely new is "Who can join" — before it, a public
          league took literally anyone, which is the whole reason the finder
          could not offer a useful filter. */}
      {view === "create" && (
        <div className="mx-scrim" onMouseDown={e => { if (e.target === e.currentTarget) setView("menu"); }}>
          <div className="mx-sheet" role="dialog" aria-modal="true" aria-label="Create league" style={{ maxWidth: 480 }}>
            <div className="mx-sheet-head">
              <span className="mx-sheet-title">Create a league</span>
              <button type="button" className="mx-sheet-close" onClick={() => setView("menu")} aria-label="Close">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
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
                  {playerOptions.map(n => (
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
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
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

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
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
                <button type="button" className="mx-btn is-quiet" onClick={() => setView("menu")}>Cancel</button>
                <button type="submit" className="mx-btn is-primary">Create league</button>
              </div>
            </form>
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
                  onClick={() => { setProfileSetup(null); if (!profileSetup.isPending) router.push(`/leagues/${profileSetup.leagueId}/members`); }}>
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
