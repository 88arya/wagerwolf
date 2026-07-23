"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import TeamLogo from "@/components/TeamLogo";

const STRIP_BG = "var(--bg)";
const STRIP_BG_HOVER = "var(--surface-4)";

function fmtOdds(american: number): string {
  return american > 0 ? `+${american}` : `${american}`;
}

export default function GamesStrip({ leagueId, interactive = true }: { leagueId: string; interactive?: boolean }) {
  const router = useRouter();
  const [week, setWeek] = useState<any>(null);
  const gamesScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!localStorage.getItem("token") || !leagueId) return;
    api(`/weeks?current=true&leagueId=${leagueId}`)
      .then((weeks: any) => { if (weeks?.[0]) setWeek(weeks[0]); })
      .catch(() => {});
  }, [leagueId]);

  // Anchor scroll to the first upcoming game
  useEffect(() => {
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

  if (!week?.games?.length) return null;

  function scrollBy(dir: -1 | 1) {
    const el = gamesScrollRef.current;
    if (!el) return;
    const w = (el.firstElementChild as HTMLElement).getBoundingClientRect().width;
    el.scrollTo({ left: Math.round(el.scrollLeft / w + dir) * w, behavior: "smooth" });
  }

  const toggleStyle = {
    flexShrink: 0,
    width: 28,
    background: STRIP_BG,
    cursor: "pointer",
    color: "var(--text-3)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    userSelect: "none" as const,
    transition: "background 0.12s",
  };

  return (
    <div style={{ flexShrink: 0, background: STRIP_BG, borderBottom: "1px solid var(--border)", padding: "0 300px" }}>
      <div style={{ display: "flex", borderLeft: "1px solid var(--border)", borderRight: "1px solid var(--border)" }}>
        <div
          onClick={() => scrollBy(-1)}
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
            {week.games.map((game: any) => {
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
                          <span style={{ fontSize: "0.62rem", fontWeight: 700, color: "var(--text-3)" }}>{new Date(game.gameDate).toLocaleDateString("en-US", { weekday: "short", timeZone: "America/New_York" })}</span>
                          <span style={{ fontSize: "0.62rem", fontWeight: 700, color: "var(--text-3)" }}>{new Date(game.gameDate).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/New_York" })}</span>
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
          onClick={() => scrollBy(1)}
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
