"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import HelmetAvatar from "@/components/HelmetAvatar";

export default function MembersPage({ params }: PageProps<"/leagues/[leagueId]/members">) {
  const router = useRouter();
  const [leagueId, setLeagueId] = useState("");
  const [userId, setUserId] = useState("");
  const [members, setMembers] = useState<any[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    async function load() {
      if (!localStorage.getItem("token")) { router.push("/"); return; }
      const id = localStorage.getItem("userId")!;
      setUserId(id);
      const { leagueId: lid } = await params;
      setLeagueId(lid);

      const board = await api(`/leagues/${lid}/leaderboard`);
      setMembers(board ?? []);
      setLoaded(true);
    }
    load();
  }, []);

  if (!loaded) return <div className="loading">Loading…</div>;

  return (
    <div className="page">
      <div className="card" style={{ padding: 0, overflow: "hidden", background: "#fff" }}>
        <div style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)" }}>
          <span style={{ fontSize: "0.58rem", fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--text)" }}>Members</span>
        </div>
        {members.map((m: any, idx: number) => {
          const isMe = m.userId === userId;
          return (
            <div
              key={m.userId}
              onClick={() => router.push(`/leagues/${leagueId}/members/${m.userId}`)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "12px 14px",
                borderBottom: idx < members.length - 1 ? "1px solid var(--border)" : "none",
                cursor: "pointer",
                transition: "background 0.1s",
              }}
              onMouseEnter={e => (e.currentTarget.style.background = "var(--surface-2)")}
              onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
            >
              <HelmetAvatar color={m.helmetColor ?? "#2563EB"} initials={m.displayName.slice(0, 2)} size={36} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: "0.85rem", fontWeight: isMe ? 700 : 500, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {m.displayName}{isMe && <span style={{ fontSize: "0.65rem", color: "var(--text-3)", fontWeight: 400, marginLeft: 6 }}>you</span>}
                </div>
                <div style={{ fontSize: "0.7rem", color: "var(--text-3)", marginTop: 2 }}>
                  {m.wins}W – {m.losses}L{m.ties > 0 ? ` – ${m.ties}T` : ""} · #{m.rank}
                </div>
              </div>
              <div style={{ textAlign: "right", flexShrink: 0 }}>
                <div style={{ fontSize: "0.8rem", fontWeight: 600, color: "var(--text)", fontVariantNumeric: "tabular-nums" }}>${m.balance.toLocaleString()}</div>
                <div style={{ fontSize: "0.65rem", color: "var(--text-3)", marginTop: 2 }}>balance</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
