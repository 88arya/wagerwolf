"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { ACCENT } from "@/lib/constants";
import HelmetAvatar from "@/components/HelmetAvatar";

export default function SchedulePage({ params }: PageProps<"/leagues/[leagueId]/schedule">) {
  const router = useRouter();
  const [userId, setUserId] = useState("");
  const [members, setMembers] = useState<any[]>([]);
  const [matchups, setMatchups] = useState<any[]>([]);
  const [currentWeekNumber, setCurrentWeekNumber] = useState<number | null>(null);
  const [loaded, setLoaded] = useState(false);

  const byUserId: Record<string, any> = {};
  members.forEach((m) => { byUserId[m.userId] = m; });

  useEffect(() => {
    async function load() {
      if (!localStorage.getItem("token")) { router.push("/"); return; }
      const id = localStorage.getItem("userId")!;
      setUserId(id);
      const { leagueId } = await params;

      const [all, board, weeks] = await Promise.all([
        api(`/leagues/${leagueId}/matchups`),
        api(`/leagues/${leagueId}/leaderboard`),
        api(`/weeks?current=true&leagueId=${leagueId}`).catch(() => null),
      ]);
      setMatchups(all ?? []);
      setMembers(board ?? []);
      if (weeks?.[0]) setCurrentWeekNumber(weeks[0].number);
      setLoaded(true);
    }
    load();
  }, []);

  if (!loaded) return <div className="loading">Loading…</div>;

  function record(uid: string): string | null {
    const m = byUserId[uid];
    if (!m) return null;
    return `${m.wins}-${m.losses}${m.ties > 0 ? `-${m.ties}` : ""}`;
  }

  const byWeek = new Map<number, any[]>();
  for (const mu of matchups) {
    if (!byWeek.has(mu.weekNumber)) byWeek.set(mu.weekNumber, []);
    byWeek.get(mu.weekNumber)!.push(mu);
  }
  const weekEntries = [...byWeek.entries()].sort((a, b) => a[0] - b[0]);

  const Side = ({ uid, name, isGhost, profit, won, resolved, align }: {
    uid: string; name: string; isGhost: boolean; profit: number | null; won: boolean; resolved: boolean; align: "left" | "right";
  }) => {
    const rec = isGhost ? null : record(uid);
    const isMe = uid === userId;
    const nameEl = (
      <div style={{ minWidth: 0, textAlign: align }}>
        <div style={{
          fontWeight: isMe || won ? 700 : 400, fontSize: "0.78rem",
          color: resolved && !won ? "var(--text-3)" : "var(--text)",
          fontStyle: isGhost ? "italic" : "normal",
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>
          {name}
        </div>
        <div style={{ fontSize: "0.62rem", color: "var(--text-3)", fontVariantNumeric: "tabular-nums", marginTop: 1 }}>
          {rec ?? " "}
        </div>
      </div>
    );
    const avatar = <HelmetAvatar color={isGhost ? "#ffffff" : (byUserId[uid]?.helmetColor ?? ACCENT)} initials={name.slice(0, 2)} size={24} />;
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0, flex: 1, justifyContent: align === "right" ? "flex-end" : "flex-start" }}>
        {align === "left" ? <>{avatar}{nameEl}</> : <>{nameEl}{avatar}</>}
      </div>
    );
  };

  return (
    <div className="page-wide" style={{ display: "flex", flexDirection: "column", alignItems: "center", paddingTop: "5vh" }}>

      <div style={{ width: "100%", maxWidth: 860, marginBottom: 16, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ fontWeight: 900, fontSize: "1.1rem", letterSpacing: "-0.01em", color: "var(--text)" }}>Schedule</div>
        {weekEntries.length > 0 && (
          <div style={{ fontSize: "0.72rem", color: "var(--text-3)" }}>
            {weekEntries.length} week{weekEntries.length !== 1 ? "s" : ""}
          </div>
        )}
      </div>

      <div style={{ width: "100%", maxWidth: 860 }}>
        {weekEntries.length === 0 ? (
          <div style={{ padding: "24px 0", color: "var(--text-3)", fontSize: "0.8rem" }}>
            No schedule yet — the schedule is generated when the season starts
          </div>
        ) : (
          weekEntries.map(([wk, wkMatchups]) => {
            const isPlayoffWeek = wkMatchups.some((m: any) => m.isPlayoff);
            const isCurrent = wk === currentWeekNumber;
            return (
              <div key={wk} style={{ marginBottom: 22 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "0 2px", marginBottom: 8 }}>
                  <span style={{ fontSize: "0.65rem", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: isCurrent ? "var(--accent)" : "var(--text-3)" }}>
                    Week {wk}
                  </span>
                  {isPlayoffWeek && (
                    <span style={{ fontSize: "0.6rem", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--pending)" }}>
                      Playoffs{wkMatchups[0]?.playoffRound ? ` · Round ${wkMatchups[0].playoffRound}` : ""}
                    </span>
                  )}
                  {isCurrent && (
                    <span style={{ fontSize: "0.6rem", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--win)" }}>
                      Current
                    </span>
                  )}
                </div>
                <div className="card" style={{ padding: 0, overflow: "hidden" }}>
                  {wkMatchups.map((mu: any, idx: number) => {
                    const isGhostHome = mu.isGhostMatchup && mu.homeUser?.email === "ghost@system.internal";
                    const isGhostAway = mu.isGhostMatchup && mu.awayUser?.email === "ghost@system.internal";
                    const homeName = isGhostHome ? "Ghost" : (mu.homeUser?.displayName ?? "TBD");
                    const awayName = isGhostAway ? "Ghost" : (mu.awayUser?.displayName ?? "TBD");
                    const resolved = !!mu.winnerId || mu.isTie;
                    const homeWon = mu.winnerId === mu.homeUserId;
                    const awayWon = mu.winnerId === mu.awayUserId;
                    const mine = mu.homeUserId === userId || mu.awayUserId === userId;
                    return (
                      <div key={mu.id} style={{
                        display: "flex", alignItems: "center", gap: 12,
                        padding: "10px 14px",
                        borderBottom: idx < wkMatchups.length - 1 ? "1px solid var(--border)" : "none",
                        background: mine ? "var(--surface-2)" : "transparent",
                      }}>
                        <Side uid={mu.homeUserId} name={homeName} isGhost={isGhostHome} profit={mu.homeProfit} won={homeWon} resolved={resolved} align="right" />
                        <div style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 6, minWidth: 118, justifyContent: "center" }}>
                          {resolved ? (
                            <>
                              <span style={{ fontSize: "0.8rem", fontWeight: homeWon ? 800 : 400, color: homeWon ? "var(--text)" : "var(--text-3)", fontVariantNumeric: "tabular-nums" }}>
                                ${(mu.homeProfit ?? 0).toFixed(2)}
                              </span>
                              <span style={{ fontSize: "0.65rem", color: "var(--text-3)" }}>–</span>
                              <span style={{ fontSize: "0.8rem", fontWeight: awayWon ? 800 : 400, color: awayWon ? "var(--text)" : "var(--text-3)", fontVariantNumeric: "tabular-nums" }}>
                                ${(mu.awayProfit ?? 0).toFixed(2)}
                              </span>
                            </>
                          ) : (
                            <span style={{ fontSize: "0.68rem", fontWeight: 500, color: "var(--text-3)", letterSpacing: "0.06em" }}>VS</span>
                          )}
                        </div>
                        <Side uid={mu.awayUserId} name={awayName} isGhost={isGhostAway} profit={mu.awayProfit} won={awayWon} resolved={resolved} align="left" />
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
