"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { fmtMoney } from "@/lib/money";
import { ACCENT } from "@/lib/constants";
import HelmetAvatar from "@/components/HelmetAvatar";

export default function ScoreboardPage({ params }: PageProps<"/leagues/[leagueId]/scoreboard">) {
  const router = useRouter();
  const [userId, setUserId] = useState("");
  const [members, setMembers] = useState<any[]>([]);
  const [weekMatchups, setWeekMatchups] = useState<any[]>([]);
  const [weekNumber, setWeekNumber] = useState<number | null>(null);
  const [loaded, setLoaded] = useState(false);

  const byUserId: Record<string, any> = {};
  members.forEach((m) => { byUserId[m.userId] = m; });

  useEffect(() => {
    async function load() {
      if (!localStorage.getItem("token")) { router.push("/"); return; }
      const id = localStorage.getItem("userId")!;
      setUserId(id);
      const { leagueId } = await params;

      const [board, weeks] = await Promise.all([
        api(`/leagues/${leagueId}/leaderboard`),
        api(`/weeks?current=true&leagueId=${leagueId}`),
      ]);
      setMembers(board ?? []);

      const currentWeek = weeks?.[0] ?? null;
      if (currentWeek) {
        setWeekNumber(currentWeek.number);
        try {
          const matchups = await api(`/leagues/${leagueId}/matchups?weekNumber=${currentWeek.number}`);
          setWeekMatchups(matchups ?? []);
        } catch {}
      }
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

  const MatchupSide = ({ uid, name, isGhost, profit, won, resolved }: {
    uid: string; name: string; isGhost: boolean; profit: number; won: boolean; resolved: boolean;
  }) => {
    const rec = isGhost ? null : record(uid);
    const isMe = uid === userId;
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 14px" }}>
        <HelmetAvatar color={isGhost ? "#ffffff" : (byUserId[uid]?.helmetColor ?? ACCENT)} initials={name.slice(0, 2)} size={28} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontWeight: isMe || won ? 700 : 400, fontSize: "0.82rem", color: resolved && !won ? "var(--text-3)" : "var(--text)",
            fontStyle: isGhost ? "italic" : "normal", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>
            {name}
          </div>
          {rec && <div style={{ fontSize: "0.65rem", color: "var(--text-3)", fontVariantNumeric: "tabular-nums", marginTop: 1 }}>{rec}</div>}
        </div>
        <span style={{
          fontSize: "0.85rem", fontWeight: won ? 800 : 400,
          color: resolved && !won ? "var(--text-3)" : "var(--text)", fontVariantNumeric: "tabular-nums", flexShrink: 0,
        }}>
          {fmtMoney(profit)}
        </span>
      </div>
    );
  };

  return (
    <div className="page-wide" style={{ display: "flex", flexDirection: "column", alignItems: "center", paddingTop: "5vh" }}>

      <div style={{ width: "100%", maxWidth: 860, marginBottom: 16, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ fontWeight: 900, fontSize: "1.1rem", letterSpacing: "-0.01em", color: "var(--text)" }}>Matchups</div>
        {weekNumber != null && <div style={{ fontSize: "0.72rem", color: "var(--text-3)" }}>NFL Week {weekNumber}</div>}
      </div>

      <div style={{ width: "100%", maxWidth: 860 }}>
        {weekMatchups.length === 0 ? (
          <div style={{ padding: "24px 0", color: "var(--text-3)", fontSize: "0.8rem" }}>No matchups yet</div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 320px), 1fr))", gap: 12 }}>
            {weekMatchups.map((matchup: any) => {
              const isGhostHome = matchup.isGhostMatchup && matchup.homeUser?.email === "ghost@system.internal";
              const isGhostAway = matchup.isGhostMatchup && matchup.awayUser?.email === "ghost@system.internal";
              const homeName = isGhostHome ? "Ghost" : (matchup.homeUser?.displayName ?? "—");
              const awayName = isGhostAway ? "Ghost" : (matchup.awayUser?.displayName ?? "—");
              const resolved = !!matchup.winnerId || matchup.isTie;
              const homeWon = matchup.winnerId === matchup.homeUserId;
              const awayWon = matchup.winnerId === matchup.awayUserId;
              const mine = matchup.homeUserId === userId || matchup.awayUserId === userId;
              return (
                <div key={matchup.id} className="card" style={{ padding: 0, overflow: "hidden", borderColor: mine ? "var(--border-2)" : "var(--border)" }}>
                  <div style={{ padding: "7px 14px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <span style={{ fontSize: "0.58rem", fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--text-3)" }}>
                      {matchup.isPlayoff ? `Playoffs · Round ${matchup.playoffRound ?? 1}` : "Head to Head"}
                    </span>
                    <span style={{ fontSize: "0.6rem", fontWeight: 700, letterSpacing: "0.06em", color: resolved ? "var(--text-3)" : "var(--win)" }}>
                      {matchup.isTie ? "TIE" : resolved ? "FINAL" : "LIVE"}
                    </span>
                  </div>
                  <MatchupSide uid={matchup.homeUserId} name={homeName} isGhost={isGhostHome} profit={matchup.homeProfit ?? 0} won={homeWon} resolved={resolved} />
                  <div style={{ borderTop: "1px solid var(--border)" }} />
                  <MatchupSide uid={matchup.awayUserId} name={awayName} isGhost={isGhostAway} profit={matchup.awayProfit ?? 0} won={awayWon} resolved={resolved} />
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
