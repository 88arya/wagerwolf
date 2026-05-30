"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import HelmetAvatar from "@/components/HelmetAvatar";

export default function ScoreboardPage({ params }: PageProps<"/leagues/[leagueId]/scoreboard">) {
  const router = useRouter();
  const [userId, setUserId] = useState("");
  const [members, setMembers] = useState<any[]>([]);
  const [weekMatchups, setWeekMatchups] = useState<any[]>([]);
  const [loaded, setLoaded] = useState(false);

  const helmetColors: Record<string, string> = {};
  members.forEach((m) => { helmetColors[m.userId] = m.helmetColor ?? "#02D18A"; });

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

  return (
    <div className="page">
      <div className="card" style={{ padding: 0, overflow: "hidden", background: "var(--surface)" }}>
        <div style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)", background: "var(--surface)" }}>
          <span style={{ fontSize: "0.58rem", fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--text)" }}>Matchups</span>
        </div>
        {weekMatchups.length === 0 ? (
          <div style={{ padding: "16px 14px" }}>
            <span style={{ fontSize: "0.8rem", color: "var(--text-3)" }}>No matchups yet</span>
          </div>
        ) : (
          weekMatchups.map((matchup: any, idx: number) => {
            const total = weekMatchups.length;
            const isHome = matchup.homeUserId === userId;
            const isAway = matchup.awayUserId === userId;
            const homeName = matchup.isGhostMatchup && matchup.homeUser?.email === "ghost@system.internal" ? "Ghost" : (matchup.homeUser?.displayName ?? "—");
            const awayName = matchup.isGhostMatchup && matchup.awayUser?.email === "ghost@system.internal" ? "Ghost" : (matchup.awayUser?.displayName ?? "—");
            const homeScore = matchup.homeProfit ?? 0;
            const awayScore = matchup.awayProfit ?? 0;
            return (
              <div key={matchup.id} style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "12px 16px",
                borderBottom: idx < total - 1 ? "1px solid var(--border)" : "none",
                background: "transparent", gap: 8,
              }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 8, flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <HelmetAvatar color={homeName === "Ghost" ? "#ffffff" : (helmetColors[matchup.homeUserId] ?? "#02D18A")} initials={homeName.slice(0, 2)} size={24} />
                    <span style={{ fontWeight: isHome ? 700 : 400, fontSize: "0.85rem", color: "var(--text)", fontStyle: homeName === "Ghost" ? "italic" : "normal", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {homeName}
                    </span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <HelmetAvatar color={awayName === "Ghost" ? "#ffffff" : (helmetColors[matchup.awayUserId] ?? "#02D18A")} initials={awayName.slice(0, 2)} size={24} />
                    <span style={{ fontWeight: isAway ? 700 : 400, fontSize: "0.85rem", color: "var(--text)", fontStyle: awayName === "Ghost" ? "italic" : "normal", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {awayName}
                    </span>
                  </div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "flex-end", flexShrink: 0 }}>
                  <span style={{ fontSize: "0.85rem", fontWeight: 700, color: "var(--text)", fontVariantNumeric: "tabular-nums" }}>${homeScore.toFixed(2)}</span>
                  <span style={{ fontSize: "0.85rem", fontWeight: 700, color: "var(--text)", fontVariantNumeric: "tabular-nums" }}>${awayScore.toFixed(2)}</span>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
