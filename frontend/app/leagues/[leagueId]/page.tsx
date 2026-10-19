"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ACCENT } from "@/lib/constants";
import { api } from "@/lib/api";
import LeagueProfileModal from "@/components/LeagueProfileModal";
import ChatDrawer from "./_dashboard/ChatDrawer";
import IdentityCard from "./_dashboard/IdentityCard";
import LeagueBanner, { ChampionBanner } from "./_dashboard/LeagueBanner";
import MatchupsPanel from "./_dashboard/MatchupsPanel";
import Panel, { emptyText } from "./_dashboard/Panel";
import PowerRankingsChart from "./_dashboard/PowerRankingsChart";
import StandingsPanel from "./_dashboard/StandingsPanel";
import type { League, Matchup, Standing, Week } from "@/lib/types";

// Until anyone has a result, rank by join order.
function powerRank(members: Standing[]) {
  const hasRecord = members.some((m) => m.wins > 0 || m.losses > 0 || m.ties > 0);
  return [...members]
    .sort((a, b) => hasRecord
      ? b.wins - a.wins || b.ties - a.ties || b.balance - a.balance
      : new Date(a.joinedAt).getTime() - new Date(b.joinedAt).getTime())
    .map((m, i) => ({ ...m, powerRank: i + 1 }));
}

export default function DashboardPage({ params }: PageProps<"/leagues/[leagueId]">) {
  const router = useRouter();
  const [leagueId, setLeagueId] = useState("");
  const [userId, setUserId] = useState("");
  const [league, setLeague] = useState<League | null>(null);
  const [week, setWeek] = useState<Week | null>(null);
  const [members, setMembers] = useState<Standing[]>([]);
  const [weekMatchups, setWeekMatchups] = useState<Matchup[]>([]);
  const [myHelmetColor, setMyHelmetColor] = useState(ACCENT);
  const [showIdentityEditor, setShowIdentityEditor] = useState(false);
  const [liveBetsCount, setLiveBetsCount] = useState(0);

  function applyBoard(board: Standing[], me: string) {
    setMembers(board);
    const mine = board.find((m) => m.userId === me);
    if (mine?.helmetColor) setMyHelmetColor(mine.helmetColor);
  }

  useEffect(() => {
    async function load() {
      if (!localStorage.getItem("token")) { router.push("/"); return; }
      const id = localStorage.getItem("userId")!;
      setUserId(id);
      const { leagueId } = await params;
      setLeagueId(leagueId);
      localStorage.setItem("leagueId", leagueId);
      setLeague(await api(`/leagues/${leagueId}`));

      try {
        const [weeks, board] = await Promise.all([
          api(`/weeks?current=true&leagueId=${leagueId}&markets=none`),
          api(`/leagues/${leagueId}/leaderboard`),
        ]);
        const currentWeek = weeks?.[0] ?? null;
        if (currentWeek) {
          setWeek(currentWeek);
          try {
            setWeekMatchups((await api(`/leagues/${leagueId}/matchups?weekNumber=${currentWeek.number}`)) ?? []);
          } catch {}
        }
        applyBoard(board, id);
      } catch {}

      try {
        const bets = await Promise.all([
          api(`/picks?leagueId=${leagueId}`),
          api(`/gamepicks?leagueId=${leagueId}`),
          api(`/parlays?leagueId=${leagueId}`),
        ]);
        setLiveBetsCount(bets.flatMap((b) => b ?? []).filter((b) => b.outcome === "PENDING").length);
      } catch {}
    }
    load();
  }, []);

  // LeagueProfileModal fires this after a save, from here or from the nav.
  useEffect(() => {
    if (!leagueId) return;
    async function refresh() {
      try {
        applyBoard((await api(`/leagues/${leagueId}/leaderboard`)) ?? [], userId);
        if (week?.number) {
          setWeekMatchups((await api(`/leagues/${leagueId}/matchups?weekNumber=${week.number}`)) ?? []);
        }
      } catch {}
    }
    window.addEventListener("league-profile-updated", refresh);
    return () => window.removeEventListener("league-profile-updated", refresh);
  }, [leagueId, userId, week?.number]);

  if (!league) return <div className="loading">Loading…</div>;

  const helmetColors: Record<string, string> = Object.fromEntries(members.map((m) => [m.userId, m.helmetColor ?? ACCENT]));
  const me = members.find((m) => m.userId === userId);

  return (
    <>
      <div className="page-wide">
        {league.seasonEnded && (
          <ChampionBanner name={members.find((m) => m.userId === league.championId)?.displayName ?? "—"} />
        )}

        <div className="league-grid" style={{
          display: "grid", gridTemplateColumns: "270px 1fr 270px", gridTemplateRows: "auto auto 1fr",
          gap: "14px 14px", alignItems: "start",
        }}>
          {me && (
            <IdentityCard member={me} helmetColor={myHelmetColor} liveBets={liveBetsCount} onEdit={() => setShowIdentityEditor(true)} />
          )}

          <MatchupsPanel matchups={weekMatchups} userId={userId} helmetColors={helmetColors} />

          <LeagueBanner league={league} teams={members.length} color={myHelmetColor} />

          <div className="lg-main" style={{ gridColumn: "2", gridRow: "2" }}>
            <Panel title="Recent Activity">
              <div style={{ padding: "18px 16px", minHeight: 160 }}>
                <span style={emptyText}>No recent activity</span>
              </div>
            </Panel>
          </div>

          <div className="lg-main" style={{ gridColumn: "2", gridRow: "3" }}>
            <Panel title="Power Rankings">
              <div style={{ padding: "12px 16px 8px" }}>
                <PowerRankingsChart rankings={powerRank(members)} />
              </div>
            </Panel>
          </div>

          <StandingsPanel members={members} userId={userId} helmetColors={helmetColors} />
        </div>
      </div>

      <ChatDrawer leagueId={leagueId} userId={userId} />

      <LeagueProfileModal
        leagueId={leagueId}
        open={showIdentityEditor}
        onClose={() => setShowIdentityEditor(false)}
      />
    </>
  );
}
