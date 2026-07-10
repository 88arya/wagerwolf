"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { ACCENT } from "@/lib/constants";
import HelmetAvatar from "@/components/HelmetAvatar";

const TH = { fontSize: "0.65rem", fontWeight: 500, color: "var(--text-3)", padding: "10px 12px 8px", borderBottom: "1px solid var(--border-2)", whiteSpace: "nowrap" as const, overflow: "hidden" as const, textAlign: "left" as const, background: "transparent" };
const TD = { fontSize: "0.78rem", fontWeight: 400, color: "var(--text)", padding: "10px 12px", borderTop: "1px solid var(--border)", fontVariantNumeric: "tabular-nums" as const, whiteSpace: "nowrap" as const, overflow: "hidden" as const };

export default function StandingsPage({ params }: PageProps<"/leagues/[leagueId]/standings">) {
  const router = useRouter();
  const [leagueId, setLeagueId] = useState("");
  const [userId, setUserId] = useState("");
  const [league, setLeague] = useState<any>(null);
  const [members, setMembers] = useState<any[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    async function load() {
      if (!localStorage.getItem("token")) { router.push("/"); return; }
      const id = localStorage.getItem("userId")!;
      setUserId(id);
      const { leagueId: lid } = await params;
      setLeagueId(lid);

      const [board, lg] = await Promise.all([
        api(`/leagues/${lid}/leaderboard`),
        api(`/leagues/${lid}`).catch(() => null),
      ]);
      setMembers(board ?? []);
      setLeague(lg);
      setLoaded(true);
    }
    load();
  }, []);

  if (!loaded) return <div className="loading">Loading…</div>;

  const leader = members[0];
  const playoffSize = league?.playoffSize ?? 0;

  return (
    <div className="page-wide" style={{ display: "flex", flexDirection: "column", alignItems: "center", paddingTop: "5vh" }}>

      <div style={{ width: "100%", maxWidth: 860, marginBottom: 16, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ fontWeight: 900, fontSize: "1.1rem", letterSpacing: "-0.01em", color: "var(--text)" }}>Standings</div>
        {playoffSize > 0 && (
          <div style={{ fontSize: "0.72rem", color: "var(--text-3)" }}>Top {playoffSize} make the playoffs</div>
        )}
      </div>

      <div style={{ width: "100%", maxWidth: 860 }}>
        {members.length === 0 ? (
          <div style={{ padding: "24px 0", color: "var(--text-3)", fontSize: "0.8rem" }}>No members yet</div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
            <colgroup>
              <col style={{ width: "7%" }} />
              <col style={{ width: "31%" }} />
              <col style={{ width: "8%" }} />
              <col style={{ width: "8%" }} />
              <col style={{ width: "8%" }} />
              <col style={{ width: "10%" }} />
              <col style={{ width: "10%" }} />
              <col style={{ width: "13%" }} />
              <col style={{ width: "5%" }} />
            </colgroup>
            <thead style={{ boxShadow: "0 4px 4px -2px rgba(0,0,0,0.08)" }}>
              <tr>
                <th style={TH}>RANK</th>
                <th style={TH}>PLAYER</th>
                <th style={TH}>W</th>
                <th style={TH}>L</th>
                <th style={TH}>T</th>
                <th style={TH}>WIN %</th>
                <th style={TH}>GB</th>
                <th style={TH}>BALANCE</th>
                <th style={TH} />
              </tr>
            </thead>
            <tbody>
              {members.map((m: any) => {
                const isMe = m.userId === userId;
                const total = m.wins + m.losses + m.ties;
                const winPct = total > 0 ? Math.round((m.wins / total) * 100) : 0;
                const gb = leader ? ((leader.wins - m.wins) + (m.losses - leader.losses)) / 2 : 0;
                const inPlayoffs = playoffSize > 0 && m.rank <= playoffSize;
                return (
                  <tr
                    key={m.userId}
                    onClick={() => league?.seasonStarted && router.push(`/leagues/${leagueId}/members/${m.userId}`)}
                    style={{ cursor: league?.seasonStarted ? "pointer" : "default", transition: "background 0.08s" }}
                    onMouseEnter={e => { (e.currentTarget as HTMLTableRowElement).style.background = "var(--surface-2)"; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLTableRowElement).style.background = "transparent"; }}
                  >
                    <td style={TD}>
                      <span style={{ fontWeight: inPlayoffs ? 600 : 400 }}>{m.rank}</span>
                    </td>
                    <td style={TD}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                        <div style={{ width: 5, height: 30, background: m.helmetColor ?? "var(--border-2)", flexShrink: 0 }} />
                        <HelmetAvatar color={m.helmetColor ?? ACCENT} initials={(m.abbreviation || m.displayName).slice(0, 2)} size={26} />
                        <div style={{ minWidth: 0 }}>
                          {m.abbreviation && <div style={{ fontSize: "0.6rem", color: "var(--text)", fontWeight: 700, fontStyle: "italic", letterSpacing: "0.1em" }}>{m.abbreviation}</div>}
                          <div style={{ fontSize: "0.78rem", fontWeight: isMe ? 700 : 400, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.displayName}</div>
                        </div>
                      </div>
                    </td>
                    <td style={TD}>{m.wins}</td>
                    <td style={TD}>{m.losses}</td>
                    <td style={TD}>{m.ties}</td>
                    <td style={TD}>{winPct}%</td>
                    <td style={TD}>{gb === 0 ? "—" : gb}</td>
                    <td style={TD}>${(m.balance ?? 0).toLocaleString()}</td>
                    <td style={{ ...TD, padding: "10px 12px 10px 4px" }}>{league?.seasonStarted && "›"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
