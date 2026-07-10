"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { ACCENT } from "@/lib/constants";
import HelmetAvatar from "@/components/HelmetAvatar";

function roundLabel(ri: number, totalRounds: number): string {
  if (ri === totalRounds - 1) return "Championship";
  if (ri === totalRounds - 2) return "Semifinals";
  return `Round ${ri + 1}`;
}

export default function BracketPage({ params }: PageProps<"/leagues/[leagueId]/bracket">) {
  const router = useRouter();
  const [userId, setUserId] = useState("");
  const [league, setLeague] = useState<any>(null);
  const [matchups, setMatchups] = useState<any[]>([]);
  const [members, setMembers] = useState<any[]>([]);
  const [loaded, setLoaded] = useState(false);

  const byUserId: Record<string, any> = {};
  members.forEach((m) => { byUserId[m.userId] = m; });

  useEffect(() => {
    async function load() {
      if (!localStorage.getItem("token")) { router.push("/"); return; }
      setUserId(localStorage.getItem("userId") ?? "");
      const { leagueId } = await params;
      const [allMatchups, board, lg] = await Promise.all([
        api(`/leagues/${leagueId}/matchups`),
        api(`/leagues/${leagueId}/leaderboard`),
        api(`/leagues/${leagueId}`).catch(() => null),
      ]);
      setMatchups(allMatchups ?? []);
      setMembers(board ?? []);
      setLeague(lg);
      setLoaded(true);
    }
    load();
  }, []);

  if (!loaded) return <div className="loading">Loading…</div>;

  const playoff = matchups.filter((m: any) => m.isPlayoff && !m.isConsolation);

  const roundMap: Record<number, any[]> = {};
  for (const m of playoff) {
    const r = m.playoffRound ?? 1;
    if (!roundMap[r]) roundMap[r] = [];
    roundMap[r].push(m);
  }
  const maxRound = Math.max(0, ...Object.keys(roundMap).map(Number));
  const rounds = Array.from({ length: maxRound }, (_, i) => roundMap[i + 1] ?? []);

  const champion = league?.seasonEnded && league?.championId ? byUserId[league.championId] : null;

  function record(uid: string): string | null {
    const m = byUserId[uid];
    if (!m) return null;
    return `${m.wins}-${m.losses}${m.ties > 0 ? `-${m.ties}` : ""}`;
  }

  const Slot = ({ uid, name, score, winner, resolved }: {
    uid?: string; name?: string; score?: number | null; winner?: boolean; resolved?: boolean;
  }) => {
    const rec = uid ? record(uid) : null;
    const isMe = uid === userId;
    return (
      <div style={{
        display: "flex", alignItems: "center", gap: 8,
        padding: "9px 12px",
        background: winner ? "var(--surface-2)" : "var(--surface)",
      }}>
        {name && uid
          ? <HelmetAvatar color={byUserId[uid]?.helmetColor ?? ACCENT} initials={name.slice(0, 2)} size={22} />
          : <div style={{ width: 22, height: 22, borderRadius: 4, background: "var(--surface-3)", flexShrink: 0 }} />
        }
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: "0.78rem", fontWeight: winner || isMe ? 700 : 400,
            color: name ? (resolved && !winner ? "var(--text-3)" : "var(--text)") : "var(--text-3)",
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>
            {name ?? "TBD"}
          </div>
          {rec && <div style={{ fontSize: "0.6rem", color: "var(--text-3)", fontVariantNumeric: "tabular-nums" }}>{rec}</div>}
        </div>
        {score != null && (
          <span style={{ fontSize: "0.75rem", fontWeight: winner ? 800 : 400, color: winner ? "var(--text)" : "var(--text-3)", fontVariantNumeric: "tabular-nums", flexShrink: 0 }}>
            ${score.toFixed(2)}
          </span>
        )}
      </div>
    );
  };

  return (
    <div className="page-wide" style={{ display: "flex", flexDirection: "column", alignItems: "center", paddingTop: "5vh" }}>

      <div style={{ width: "100%", maxWidth: 860, marginBottom: 16, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ fontWeight: 900, fontSize: "1.1rem", letterSpacing: "-0.01em", color: "var(--text)" }}>Playoff Bracket</div>
        {league?.playoffSize && (
          <div style={{ fontSize: "0.72rem", color: "var(--text-3)" }}>{league.playoffSize}-team bracket</div>
        )}
      </div>

      <div style={{ width: "100%", maxWidth: 860 }}>

        {champion && (
          <div className="card" style={{ marginBottom: 16, padding: "14px 16px", display: "flex", alignItems: "center", gap: 12 }}>
            <HelmetAvatar color={champion.helmetColor ?? ACCENT} initials={champion.displayName.slice(0, 2)} size={40} />
            <div>
              <div style={{ fontSize: "0.58rem", fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--gold)", marginBottom: 2 }}>
                League Champion
              </div>
              <div style={{ fontWeight: 800, fontSize: "0.95rem", color: "var(--text)" }}>{champion.displayName}</div>
            </div>
          </div>
        )}

        {playoff.length === 0 ? (
          <div style={{ padding: "24px 0", color: "var(--text-3)", fontSize: "0.8rem" }}>
            Playoffs haven't started yet — the bracket is seeded by standings after the regular season
          </div>
        ) : (
          <div style={{ display: "flex", gap: 20, alignItems: "stretch", overflowX: "auto", paddingBottom: 8 }}>
            {rounds.map((roundMatchups, ri) => (
              <div key={ri} style={{ display: "flex", flexDirection: "column", flex: "0 0 240px" }}>
                <div style={{ fontSize: "0.65rem", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--text-3)", marginBottom: 8, padding: "0 2px" }}>
                  {roundLabel(ri, rounds.length)}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 14, flex: 1, justifyContent: "space-around" }}>
                  {(roundMatchups.length > 0 ? roundMatchups : [null]).map((mu: any, i: number) => {
                    if (!mu) return (
                      <div key={i} className="card" style={{ padding: 0, overflow: "hidden", opacity: 0.5 }}>
                        <Slot />
                        <div style={{ borderTop: "1px solid var(--border)" }} />
                        <Slot />
                      </div>
                    );
                    const resolved = !!mu.winnerId || mu.isTie;
                    const homeWon = mu.winnerId === mu.homeUserId;
                    const awayWon = mu.winnerId === mu.awayUserId;
                    return (
                      <div key={mu.id} className="card" style={{ padding: 0, overflow: "hidden" }}>
                        <Slot uid={mu.homeUserId} name={mu.homeUser?.displayName} score={mu.homeProfit} winner={homeWon} resolved={resolved} />
                        <div style={{ borderTop: "1px solid var(--border)" }} />
                        <Slot uid={mu.awayUserId} name={mu.awayUser?.displayName} score={mu.awayProfit} winner={awayWon} resolved={resolved} />
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
