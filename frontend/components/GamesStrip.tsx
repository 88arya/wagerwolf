"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import TeamLogo from "@/components/TeamLogo";
import HelmetAvatar from "@/components/HelmetAvatar";
import { ACCENT } from "@/lib/constants";
import { fmtMoney } from "@/lib/money";

const STRIP_BG = "var(--bg)";
const STRIP_BG_HOVER = "var(--surface-4)";

// One card's natural height, measured: 12px top pad + status row + 6px gap +
// two 20px team rows separated by 6px + 6px bottom pad. The strip reserves this
// while the week is loading so games arriving don't shove the page down. If the
// card's padding or logo size changes, re-measure.
const STRIP_ROW_H = 80;

// The strip is mounted by two different layouts — app/(user)/layout.tsx and
// app/leagues/[leagueId]/layout.tsx — so navigating between a league and /home
// crosses a layout boundary and swaps one instance for another. Caching the
// week per league lets the new instance paint from memory instead of flashing
// an empty bar while it refetches.
const weekCache = new Map<string, any>();

// The two things the strip can show. NFL is the default; MATCHUPS reuses the
// exact same card shape with league members in place of teams.
// Width of each scroll arrow. The mode selector's width formula depends on it,
// so change it here rather than inline.
const ARROW_W = 28;

type StripMode = "NFL" | "MATCHUPS";
const MODE_LABEL: Record<StripMode, string> = {
  NFL: "NFL",
  MATCHUPS: "MATCHUPS",
};

function fmtOdds(american: number): string {
  return american > 0 ? `+${american}` : `${american}`;
}

export default function GamesStrip({ leagueId, interactive = true }: { leagueId: string; interactive?: boolean }) {
  const router = useRouter();
  const cached = leagueId ? weekCache.get(leagueId) : null;
  const [week, setWeek] = useState<any>(cached ?? null);
  // Whether the fetch has settled. Distinguishes "still loading" (reserve the
  // height) from "resolved, nothing to show" (collapse for real).
  const [loaded, setLoaded] = useState(!!cached);
  const [mode, setMode] = useState<StripMode>("NFL");
  const [menuOpen, setMenuOpen] = useState(false);
  const [matchupRows, setMatchupRows] = useState<any[] | null>(null);
  const gamesScrollRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  // Drop cached matchups when the league or week changes. Without this the
  // `if (matchupRows)` guard below would keep showing the previous league's
  // pairings, since that guard blocks any refetch once rows are held.
  useEffect(() => { setMatchupRows(null); }, [leagueId, week?.number]);

  // Matchups are fetched lazily — only once the user actually switches modes,
  // so the default NFL view costs no extra request.
  useEffect(() => {
    if (mode !== "MATCHUPS" || !leagueId || matchupRows) return;
    if (!localStorage.getItem("token")) return;
    const wk = week?.number;
    api(`/leagues/${leagueId}/matchups${wk ? `?weekNumber=${wk}` : ""}`)
      .then((rows: any[]) => setMatchupRows(rows ?? []))
      .catch(() => setMatchupRows([]));
  }, [mode, leagueId, week?.number, matchupRows]);

  // The two modes hold different numbers of cards, so a scroll offset carried
  // over from the other one can land on blank space. Reset on every switch.
  useEffect(() => {
    if (gamesScrollRef.current) gamesScrollRef.current.scrollLeft = 0;
  }, [mode]);

  useEffect(() => {
    if (!leagueId) return;
    const hit = weekCache.get(leagueId);
    if (hit) { setWeek(hit); setLoaded(true); }
    if (!localStorage.getItem("token")) return;
    api(`/weeks?current=true&leagueId=${leagueId}`)
      .then((weeks: any) => {
        if (weeks?.[0]) { weekCache.set(leagueId, weeks[0]); setWeek(weeks[0]); }
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, [leagueId]);

  // Anchor scroll to the first upcoming game. NFL mode only — the indices are
  // game indices, and applying them to the matchup list would scroll to an
  // unrelated position.
  useEffect(() => {
    if (mode !== "NFL") return;
    const games: any[] = week?.games ?? [];
    if (!games.length) return;
    const el = gamesScrollRef.current;
    if (!el) return;

    const now = new Date();
    const firstUpcoming = games.findIndex(
      (g) => g.status !== "FINAL" && g.status !== "CANCELLED" && new Date(g.gameDate) > now
    );
    const rawIndex = firstUpcoming === -1 ? games.length : firstUpcoming;
    const targetIndex = Math.min(rawIndex, Math.max(0, games.length - 8));

    requestAnimationFrame(() => {
      const cardWidth = el.scrollWidth / games.length;
      el.scrollLeft = targetIndex * cardWidth;
    });
  }, [week]);

  // Poll every 60s when any game is live
  useEffect(() => {
    const hasLive = week?.games?.some((g: any) => g.status === "IN_PROGRESS");
    if (!hasLive || !leagueId) return;
    const interval = setInterval(async () => {
      try {
        const weeks = await api(`/weeks?current=true&leagueId=${leagueId}`);
        if (weeks?.[0]) setWeek(weeks[0]);
      } catch {}
    }, 60000);
    return () => clearInterval(interval);
  }, [week, leagueId]);

  // Only NFL mode collapses when empty. In matchups mode the frame has to stay
  // up regardless — it carries the mode selector, and returning null would take
  // away the only control for switching back.
  if (mode === "NFL" && !week?.games?.length) {
    // Settled with nothing to show — collapse. Otherwise hold the space so the
    // page below doesn't jump once the games land.
    if (loaded) return null;
    return (
      <div style={{ flexShrink: 0, background: STRIP_BG, padding: "0 300px" }}>
        <div style={{ height: STRIP_ROW_H, borderLeft: "1px solid var(--border)", borderRight: "1px solid var(--border)" }} />
      </div>
    );
  }

  function scrollBy(dir: -1 | 1) {
    const el = gamesScrollRef.current;
    if (!el) return;
    const w = (el.firstElementChild as HTMLElement).getBoundingClientRect().width;
    el.scrollTo({ left: Math.round(el.scrollLeft / w + dir) * w, behavior: "smooth" });
  }

  // Guard: with an empty scroller (a league with no matchups yet) there is no
  // first child to measure, and reading its rect would throw on arrow click.
  function safeScrollBy(dir: -1 | 1) {
    const el = gamesScrollRef.current;
    if (!el || !el.firstElementChild) return;
    scrollBy(dir);
  }

  const toggleStyle = {
    flexShrink: 0,
    width: ARROW_W,
    background: STRIP_BG,
    cursor: "pointer",
    color: "var(--text-3)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    userSelect: "none" as const,
    transition: "background 0.12s",
  };

  // Accent-blue mode selector. Sits at the head of the strip and names what the
  // strip is currently showing; the chevron opens the two-option menu.
  const modeSelector = (
    // Width is pinned to exactly one card. The row is [selector | ‹ | scroller | ›]
    // and a card is 1/8 of the scroller, so solving W = (R - W - 56) / 8 for the
    // row width R gives W = (R - 56) / 9 — the 56px being the two 28px arrows.
    // Keeps the box from resizing as the label changes, and holds the card grid
    // aligned at any viewport. minWidth only ever makes it wider, never narrower
    // than a card.
    <div ref={menuRef} style={{
      position: "relative", flexShrink: 0, display: "flex",
      width: `calc((100% - ${ARROW_W * 2}px) / 9)`, minWidth: 132,
    }}>
      <button
        type="button"
        onClick={() => setMenuOpen((o) => !o)}
        style={{
          display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8,
          width: "100%", height: "100%", padding: "0 12px",
          background: ACCENT, color: "#FFFFFF",
          border: "none", borderRadius: 0, boxShadow: "none",
          fontSize: "0.68rem", fontWeight: 700, letterSpacing: "0.08em",
          whiteSpace: "nowrap", cursor: "pointer",
        }}
      >
        {MODE_LABEL[mode]}
        <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round"
          style={{ transform: menuOpen ? "rotate(180deg)" : "none", transition: "transform 0.15s", flexShrink: 0 }}>
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {menuOpen && (
        <div style={{
          position: "absolute", top: "100%", left: 0, zIndex: 400,
          background: "var(--surface)", boxShadow: "var(--shadow-md)",
          padding: "6px 0", minWidth: 190,
        }}>
          {/* Styled inline rather than with .navmenu-league: that rule is
              scoped to `.nav`, and the strip sits outside it, so the items
              would fall back to the global navy `button` fill. */}
          {(["NFL", "MATCHUPS"] as StripMode[]).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => { setMode(m); setMenuOpen(false); }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "var(--surface-2)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "none"; }}
              style={{
                display: "block", width: "100%", textAlign: "left",
                padding: "8px 14px",
                background: "none", border: "none", borderRadius: 0, boxShadow: "none",
                color: "#000", cursor: "pointer",
                fontSize: "0.68rem", fontWeight: mode === m ? 700 : 500,
                letterSpacing: "0.08em", whiteSpace: "nowrap",
              }}
            >
              {MODE_LABEL[m]}
            </button>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div style={{ flexShrink: 0, background: STRIP_BG, padding: "0 300px" }}>
      <div style={{ display: "flex", borderLeft: "1px solid var(--border)", borderRight: "1px solid var(--border)" }}>
        {modeSelector}
        <div
          onClick={() => safeScrollBy(-1)}
          onMouseEnter={e => (e.currentTarget.style.background = STRIP_BG_HOVER)}
          onMouseLeave={e => (e.currentTarget.style.background = STRIP_BG)}
          style={{ ...toggleStyle, borderRight: "1px solid var(--border)" }}
        >
          <svg width="6" height="10" viewBox="0 0 9 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="7,1 2,7 7,13" /></svg>
        </div>
        <div style={{ flex: 1, overflow: "hidden", position: "relative" }}>
          <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 14, background: "linear-gradient(to right, rgba(0,0,0,0.07), transparent)", zIndex: 1, pointerEvents: "none" }} />
          <div style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: 14, background: "linear-gradient(to left, rgba(0,0,0,0.07), transparent)", zIndex: 1, pointerEvents: "none" }} />
          <div ref={gamesScrollRef} className="no-scrollbar" style={{ display: "flex", overflowX: "auto" }}>
            {mode === "MATCHUPS" ? (matchupRows ?? []).map((mu: any) => {
              // Same card frame as a game, minus the status row: no kickoff
              // time and no open-in-page arrow, since a matchup has neither.
              const side = (u: any) => (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 7 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 7, minWidth: 0 }}>
                    <HelmetAvatar color={u?.helmetColor ?? ACCENT} initials={(u?.abbreviation || u?.displayName || "?").slice(0, 2)} size={20} />
                    <span style={{ fontWeight: 700, fontSize: "0.75rem", color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {u?.abbreviation || u?.displayName || "—"}
                    </span>
                  </div>
                  <span style={{ fontSize: "0.7rem", fontWeight: 550, fontVariantNumeric: "tabular-nums", color: "var(--text)", whiteSpace: "nowrap" }}>
                    {u?.balance != null ? fmtMoney(u.balance) : "—"}
                  </span>
                </div>
              );
              return (
                <div key={mu.id} style={{
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "center",
                  padding: "12px 14px 6px",
                  gap: 6,
                  flex: "0 0 calc(100% / 8)",
                  boxSizing: "border-box",
                  background: STRIP_BG,
                  borderRight: "1px solid var(--border)",
                  minHeight: STRIP_ROW_H,
                }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {side(mu.awayUser)}
                    {side(mu.homeUser)}
                  </div>
                </div>
              );
            }) : week.games.map((game: any) => {
              const now = new Date();
              const isLive = game.status === "IN_PROGRESS" ||
                (game.status !== "FINAL" && game.status !== "CANCELLED" && game.gameDate && new Date(game.gameDate) <= now);
              const isScheduled = !isLive && game.status !== "FINAL" && game.status !== "CANCELLED";
              const awayML = isScheduled ? game.gameLines?.find((l: any) => l.market === "MONEYLINE_AWAY") : null;
              const homeML = isScheduled ? game.gameLines?.find((l: any) => l.market === "MONEYLINE_HOME") : null;
              return (
                <div key={game.id}
                  onClick={interactive ? () => router.push(`/leagues/${leagueId}/bet?gameId=${game.id}`) : undefined}
                  onMouseEnter={interactive ? e => (e.currentTarget.style.background = STRIP_BG_HOVER) : undefined}
                  onMouseLeave={interactive ? e => (e.currentTarget.style.background = STRIP_BG) : undefined}
                  style={{
                  display: "flex",
                  flexDirection: "column",
                  padding: "12px 14px 6px",
                  gap: 6,
                  flex: "0 0 calc(100% / 8)",
                  boxSizing: "border-box",
                  background: STRIP_BG,
                  borderRight: "1px solid var(--border)",
                  transition: "background 0.12s",
                  cursor: interactive ? "pointer" : "default",
                }}>
                  {/* Top row */}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", lineHeight: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      {isLive ? (
                        <>
                          <div style={{ width: 5, height: 5, borderRadius: "50%", background: "var(--win)", flexShrink: 0 }} />
                          <span style={{ fontSize: "0.62rem", color: "var(--win)", fontWeight: 700, letterSpacing: "0.04em" }}>LIVE</span>
                        </>
                      ) : isScheduled && game.gameDate ? (
                        <>
                          {/* No timeZone option — weekday and time both render in the
                              viewer's own zone, matching the game-card footers. */}
                          <span style={{ fontSize: "0.62rem", fontWeight: 700, color: "var(--text-3)", textTransform: "uppercase" }}>{new Date(game.gameDate).toLocaleDateString("en-US", { weekday: "short" })}</span>
                          <span style={{ fontSize: "0.62rem", fontWeight: 700, color: "var(--text-3)" }}>{new Date(game.gameDate).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}</span>
                        </>
                      ) : game.status === "CANCELLED" ? (
                        <span style={{ fontSize: "0.62rem", color: "var(--loss)", fontWeight: 700 }}>CANCELLED</span>
                      ) : (
                        <span style={{ fontSize: "0.62rem", fontWeight: 700, color: "var(--text-3)" }}>FINAL</span>
                      )}
                    </div>
                    {isLive ? (
                      game.statusDetail && <span style={{ fontSize: "0.62rem", color: "var(--text-3)", fontWeight: 700, whiteSpace: "nowrap" }}>{game.statusDetail}</span>
                    ) : isScheduled && interactive ? (
                      <svg width="9" height="9" viewBox="0 0 10 10" fill="none" stroke="var(--text-3)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M3 1h6v6M9 1L1 9" />
                      </svg>
                    ) : null}
                  </div>
                  {/* Teams + scores */}
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 7 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                        <TeamLogo team={game.awayTeam} size={20} plain />
                        <span style={{ fontWeight: 700, fontSize: "0.75rem", color: "var(--text)" }}>{game.awayTeam}</span>
                      </div>
                      {(isLive || game.status === "FINAL") ? (
                        <span style={{ fontSize: "0.75rem", fontWeight: 700, fontVariantNumeric: "tabular-nums", color: "var(--text)" }}>{game.awayScore}</span>
                      ) : awayML ? (
                        <span style={{ fontSize: "0.7rem", fontWeight: 550, fontVariantNumeric: "tabular-nums", color: "var(--text)" }}>{fmtOdds(awayML.odds)}</span>
                      ) : null}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 7 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                        <TeamLogo team={game.homeTeam} size={20} plain />
                        <span style={{ fontWeight: 700, fontSize: "0.75rem", color: "var(--text)" }}>{game.homeTeam}</span>
                      </div>
                      {(isLive || game.status === "FINAL") ? (
                        <span style={{ fontSize: "0.75rem", fontWeight: 700, fontVariantNumeric: "tabular-nums", color: "var(--text)" }}>{game.homeScore}</span>
                      ) : homeML ? (
                        <span style={{ fontSize: "0.7rem", fontWeight: 550, fontVariantNumeric: "tabular-nums", color: "var(--text)" }}>{fmtOdds(homeML.odds)}</span>
                      ) : null}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        <div
          onClick={() => safeScrollBy(1)}
          onMouseEnter={e => (e.currentTarget.style.background = STRIP_BG_HOVER)}
          onMouseLeave={e => (e.currentTarget.style.background = STRIP_BG)}
          style={{ ...toggleStyle, borderLeft: "1px solid var(--border)" }}
        >
          <svg width="6" height="10" viewBox="0 0 9 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="2,1 7,7 2,13" /></svg>
        </div>
      </div>
    </div>
  );
}
