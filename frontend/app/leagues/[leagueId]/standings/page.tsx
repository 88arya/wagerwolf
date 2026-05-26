"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import HelmetAvatar from "@/components/HelmetAvatar";

const RANK_COLS = "28px 1fr 28px 28px 28px 36px";

export default function StandingsPage({ params }: PageProps<"/leagues/[leagueId]/standings">) {
  const router = useRouter();
  const [userId, setUserId] = useState("");
  const [members, setMembers] = useState<any[]>([]);
  const [loaded, setLoaded] = useState(false);

  const helmetColors: Record<string, string> = {};
  members.forEach((m) => { helmetColors[m.userId] = m.helmetColor ?? "#0070EB"; });

  useEffect(() => {
    async function load() {
      if (!localStorage.getItem("token")) { router.push("/"); return; }
      const id = localStorage.getItem("userId")!;
      setUserId(id);
      const { leagueId } = await params;

      const board = await api(`/leagues/${leagueId}/leaderboard`);
      setMembers(board ?? []);
      setLoaded(true);
    }
    load();
  }, []);

  if (!loaded) return <div className="loading">Loading…</div>;

  const leader = members[0];

  return (
    <div className="page">
      <div className="card" style={{ padding: 0, overflow: "hidden", background: "#fff" }}>
        <div style={{ padding: "10px 14px", background: "#fff", borderBottom: "1px solid var(--border)" }}>
          <span style={{ fontSize: "0.58rem", fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--text)" }}>Standings</span>
        </div>
        <div style={{
          display: "grid", gridTemplateColumns: RANK_COLS,
          padding: "6px 14px", gap: 6,
          background: "#fff", borderBottom: "1px solid var(--border)",
        }}>
          {["#", "Player", "W", "L", "T", "GB"].map((h, i) => (
            <span key={h} style={{ fontSize: "0.58rem", fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--text)", textAlign: i >= 2 ? "center" : "left" }}>{h}</span>
          ))}
        </div>
        {members.map((m: any, idx: number) => {
          const isMe = m.userId === userId;
          const gb = leader ? ((leader.wins - m.wins) + (m.losses - leader.losses)) / 2 : 0;
          const gbStr = gb === 0 ? "--" : String(gb);
          return (
            <div key={m.userId} style={{
              display: "grid",
              gridTemplateColumns: RANK_COLS,
              padding: "8px 14px",
              borderBottom: idx < members.length - 1 ? "1px solid var(--border)" : "none",
              background: "transparent",
              alignItems: "center",
              gap: 6,
            }}>
              <span style={{ fontWeight: 400, fontSize: "0.85rem", color: "var(--text)" }}>{m.rank}</span>
              <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                <HelmetAvatar color={helmetColors[m.userId] ?? "#0070EB"} initials={m.displayName.slice(0, 2)} size={26} />
                <span style={{ fontWeight: isMe ? 700 : 400, fontSize: "0.85rem", color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {m.displayName}
                </span>
              </div>
              <span style={{ fontSize: "0.8rem", color: "var(--text-2)", textAlign: "center", fontVariantNumeric: "tabular-nums" }}>{m.wins}</span>
              <span style={{ fontSize: "0.8rem", color: "var(--text-2)", textAlign: "center", fontVariantNumeric: "tabular-nums" }}>{m.losses}</span>
              <span style={{ fontSize: "0.8rem", color: "var(--text-2)", textAlign: "center", fontVariantNumeric: "tabular-nums" }}>{m.ties}</span>
              <span style={{ fontSize: "0.8rem", color: "var(--text-2)", textAlign: "center", fontVariantNumeric: "tabular-nums" }}>{gbStr}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
