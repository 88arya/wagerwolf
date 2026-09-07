"use client";

import { useEffect, useState } from "react";
import { Compass, Lock, Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { fmtMoney } from "@/lib/money";
import LeagueActions, { LEAGUES_CHANGED, type LeagueAction } from "@/components/LeagueActions";

/**
 * The leagues surface, as a right-hand rail: the list of leagues you are in,
 * the wide table behind its header, and the three ways into a new one.
 *
 * This was the whole of `/leagues` — a full-width page whose body was one wide
 * table. That page is gone: the utility bar already carried both "Home" and
 * "Leagues" as separate destinations, and the second one existed only to show
 * a list you consult occasionally and then leave. It is now a rail, and the
 * table it used to *be* is a popup you open from the rail's header.
 *
 * THE THREE ACTION SHEETS ARE NOT HERE ANY MORE. Quick Join, the invite-code
 * form, the create sheet and the first-run profile sheet were all inline in
 * this file, on the argument that they shared the membership list below with
 * the rail. They did not — they only ever WROTE to it. They live in
 * components/LeagueActions now, which the sidebar also mounts, so the same
 * three surfaces are reachable from every route rather than only from wherever
 * this rail happens to be rendered. This component listens for LEAGUES_CHANGED
 * and refetches; it does not own them.
 *
 * What genuinely does share state stays here: the rail's list and the table
 * read one membership fetch.
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
  // The old page's wide table, now behind the rail's header.
  const [tableOpen, setTableOpen] = useState(false);
  // Which LeagueActions sheet this rail has open, if any. The sidebar's menu
  // holds its own copy of this — two triggers, one component, no shared state.
  const [action, setAction] = useState<LeagueAction | null>(null);

  useEffect(() => {
    loadMemberships();
  }, []);

  // A join, a redeemed code or a created league all change this list, and any
  // of them can happen from the sidebar rather than from here. LeagueActions
  // announces rather than calling in, so this listener is the whole wiring.
  useEffect(() => {
    const onChanged = () => loadMemberships();
    window.addEventListener(LEAGUES_CHANGED, onChanged);
    return () => window.removeEventListener(LEAGUES_CHANGED, onChanged);
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
            <div style={{ fontSize: "0.78rem", color: "var(--text-2)", marginBottom: 8 }}>Couldn&apos;t load your leagues</div>
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


        {/* Actions. Same three the old page header carried — but the sheets
            they open are LeagueActions', shared with the sidebar's menu. */}
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 14 }}>
          <button type="button" className="mx-btn is-quiet" style={{ justifyContent: "flex-start" }}
            onClick={() => setAction("public")}>
            <Compass size={13} /> Join a league
          </button>
          <button type="button" className="mx-btn is-quiet" style={{ justifyContent: "flex-start" }}
            onClick={() => setAction("private")}>
            <Lock size={13} /> Invite code
          </button>
          <button type="button" className="mx-btn is-primary" style={{ justifyContent: "flex-start" }}
            onClick={() => setAction("create")}>
            <Plus size={13} /> Create league
          </button>
        </div>
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
                  Couldn&apos;t load your leagues
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


      <LeagueActions action={action} onClose={() => setAction(null)} />
    </>
  );
}
