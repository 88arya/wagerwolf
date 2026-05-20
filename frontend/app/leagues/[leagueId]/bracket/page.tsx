"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import HelmetAvatar from "@/components/HelmetAvatar";

function BracketSlot({ name, score, winner, helmetColor }: { name?: string; score?: number | null; winner?: boolean; helmetColor?: string }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 8,
      padding: "7px 10px",
      background: winner ? "var(--surface-2)" : "#fff",
      borderBottom: "1px solid var(--border)",
    }}>
      {name
        ? <HelmetAvatar color={helmetColor ?? "#2563EB"} initials={name.slice(0, 2)} size={20} />
        : <div style={{ width: 20, height: 20, borderRadius: 4, background: "var(--surface-3)", flexShrink: 0 }} />
      }
      <span style={{ flex: 1, fontSize: "0.8rem", fontWeight: winner ? 700 : 400, color: name ? "var(--text)" : "var(--text-3)" }}>
        {name ?? "TBD"}
      </span>
      {score != null && (
        <span style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--text)", fontVariantNumeric: "tabular-nums" }}>
          ${score.toFixed(2)}
        </span>
      )}
    </div>
  );
}

function MatchupCard({ matchup, helmetColors }: { matchup: any; helmetColors: Record<string, string> }) {
  const homeName = matchup?.homeUser?.displayName;
  const awayName = matchup?.awayUser?.displayName;
  const homeWon = matchup?.winnerId && matchup.winnerId === matchup.homeUserId;
  const awayWon = matchup?.winnerId && matchup.winnerId === matchup.awayUserId;

  return (
    <div style={{ border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden", minWidth: 180 }}>
      <BracketSlot name={homeName} score={matchup?.homeProfit} winner={homeWon} helmetColor={helmetColors[matchup?.homeUserId]} />
      <BracketSlot name={awayName} score={matchup?.awayProfit} winner={awayWon} helmetColor={helmetColors[matchup?.awayUserId]} />
    </div>
  );
}

function EmptyMatchupCard() {
  return (
    <div style={{ border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden", minWidth: 180, opacity: 0.5 }}>
      <BracketSlot />
      <BracketSlot />
    </div>
  );
}

function BracketSection({ title, rounds }: { title: string; rounds: any[][] }) {
  return (
    <div>
      <div style={{ fontSize: "0.58rem", fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--text-3)", marginBottom: 12 }}>
        {title}
      </div>
      <div style={{ display: "flex", gap: 24, alignItems: "flex-start" }}>
        {rounds.map((matchups, ri) => (
          <div key={ri} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ fontSize: "0.58rem", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--text-3)", marginBottom: 4 }}>
              {ri === rounds.length - 1 ? "Final" : `Round ${ri + 1}`}
            </div>
            {matchups.length > 0
              ? matchups.map((mu: any, i: number) =>
                  mu ? <MatchupCard key={mu.id ?? i} matchup={mu} helmetColors={{}} /> : <EmptyMatchupCard key={i} />
                )
              : <EmptyMatchupCard />
            }
          </div>
        ))}
      </div>
    </div>
  );
}

export default function BracketPage({ params }: PageProps<"/leagues/[leagueId]/bracket">) {
  const router = useRouter();
  const [matchups, setMatchups] = useState<any[]>([]);
  const [members, setMembers] = useState<any[]>([]);
  const [loaded, setLoaded] = useState(false);

  const helmetColors: Record<string, string> = {};
  members.forEach((m) => { helmetColors[m.userId] = m.helmetColor ?? "#2563EB"; });

  useEffect(() => {
    async function load() {
      if (!localStorage.getItem("token")) { router.push("/"); return; }
      const { leagueId } = await params;
      const [allMatchups, board] = await Promise.all([
        api(`/leagues/${leagueId}/matchups`),
        api(`/leagues/${leagueId}/leaderboard`),
      ]);
      setMatchups(allMatchups ?? []);
      setMembers(board ?? []);
      setLoaded(true);
    }
    load();
  }, []);

  if (!loaded) return <div className="loading">Loading…</div>;

  const playoff = matchups.filter((m: any) => m.isPlayoff);
  const consolation = matchups.filter((m: any) => m.isConsolation);

  function groupByRound(list: any[]) {
    const map: Record<number, any[]> = {};
    for (const m of list) {
      const r = m.playoffRound ?? 1;
      if (!map[r]) map[r] = [];
      map[r].push(m);
    }
    const maxRound = Math.max(0, ...Object.keys(map).map(Number));
    return Array.from({ length: maxRound }, (_, i) => map[i + 1] ?? []);
  }

  const playoffRounds = groupByRound(playoff);
  const consolationRounds = groupByRound(consolation);

  const noPlayoffs = playoff.length === 0;
  const noConsolation = consolation.length === 0;

  return (
    <div className="page">
      <div style={{ display: "flex", flexDirection: "column", gap: 32 }}>

        {/* Playoff bracket */}
        <div className="card" style={{ padding: "16px 20px", overflow: "auto" }}>
          {noPlayoffs ? (
            <div>
              <div style={{ fontSize: "0.58rem", fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--text-3)", marginBottom: 12 }}>Playoff Bracket</div>
              <span style={{ fontSize: "0.8rem", color: "var(--text-3)" }}>Playoffs haven't started yet</span>
            </div>
          ) : (
            <BracketSection title="Playoff Bracket" rounds={playoffRounds} />
          )}
        </div>

        {/* Consolation bracket */}
        <div className="card" style={{ padding: "16px 20px", overflow: "auto" }}>
          {noConsolation ? (
            <div>
              <div style={{ fontSize: "0.58rem", fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--text-3)", marginBottom: 12 }}>Consolation Bracket</div>
              <span style={{ fontSize: "0.8rem", color: "var(--text-3)" }}>Consolation bracket hasn't started yet</span>
            </div>
          ) : (
            <BracketSection title="Consolation Bracket" rounds={consolationRounds} />
          )}
        </div>

      </div>
    </div>
  );
}
