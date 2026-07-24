"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ACCENT } from "@/lib/constants";
import { api } from "@/lib/api";
import { fmtMoney } from "@/lib/money";
import HelmetAvatar from "@/components/HelmetAvatar";

function calcProfit(stake: number, odds: number): number {
  if (odds > 0) return Math.round((stake * odds) / 100);
  return Math.round((stake * 100) / Math.abs(odds));
}

function fmtOdds(n: number) { return n > 0 ? `+${n}` : `${n}`; }

function OutcomeBadge({ outcome, cashedOut }: { outcome: string; cashedOut?: boolean }) {
  const label = outcome === "VOID" && cashedOut ? "CASHED" : outcome;
  if (label === "WIN")    return <span className="badge badge-green">WIN</span>;
  if (label === "LOSS")   return <span className="badge badge-red">LOSS</span>;
  if (label === "CASHED") return <span className="badge" style={{ color: "var(--pending)", borderColor: "rgba(245,158,11,0.3)", background: "var(--pending-bg)" }}>CASHED</span>;
  if (label === "PENDING") return <span className="badge badge-yellow">PENDING</span>;
  return <span className="badge">{label}</span>;
}

function LockIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="10" width="16" height="10" rx="2" />
      <path d="M8 10V7a4 4 0 018 0v3" />
    </svg>
  );
}

function BetCard({ bet }: { bet: any }) {
  if (bet.hidden) {
    return (
      <div className="card" style={{ padding: "11px 14px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--text-3)" }}>
          <LockIcon />
          <span style={{ fontSize: "0.78rem", fontWeight: 600 }}>
            {bet.type === "parlay" ? `${bet.legCount}-Leg Parlay` : "Bet"} in progress
          </span>
        </div>
        <span className="badge badge-yellow">PENDING</span>
      </div>
    );
  }

  if (bet.type === "pick") {
    const profit = bet.outcome === "WIN" ? calcProfit(Number(bet.stake), bet.odds) : null;
    const toWin = calcProfit(Number(bet.stake), bet.odds);
    return (
      <div className="card" style={{ padding: "11px 14px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 7 }}>
          <div style={{ flex: 1, minWidth: 0, paddingRight: 8 }}>
            <div style={{ fontWeight: 700, fontSize: "0.82rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{bet.playerName}</div>
            <div style={{ fontSize: "0.72rem", color: "var(--text-2)", marginTop: 2 }}>
              {bet.direction} {bet.line} {bet.statType?.split("_").join(" ")}
            </div>
          </div>
          <OutcomeBadge outcome={bet.outcome} cashedOut={bet.cashedOut} />
        </div>
        <div style={{ display: "flex", gap: 10, fontSize: "0.72rem", color: "var(--text-3)", fontVariantNumeric: "tabular-nums" }}>
          <span>{fmtOdds(bet.odds)}</span>
          <span>stake {fmtMoney(bet.stake)}</span>
          {profit != null
            ? <span style={{ color: "var(--win)", fontWeight: 700 }}>{fmtMoney(profit, { sign: true })}</span>
            : <span>to win {fmtMoney(toWin)}</span>}
        </div>
      </div>
    );
  }

  if (bet.type === "gamepick") {
    const profit = bet.outcome === "WIN" ? calcProfit(Number(bet.stake), bet.odds) : null;
    const toWin = calcProfit(Number(bet.stake), bet.odds);
    return (
      <div className="card" style={{ padding: "11px 14px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 7 }}>
          <div style={{ flex: 1, minWidth: 0, paddingRight: 8 }}>
            <div style={{ fontWeight: 700, fontSize: "0.82rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{bet.label}</div>
            <div style={{ fontSize: "0.68rem", color: "var(--text-3)", marginTop: 2 }}>
              {bet.game?.awayTeam} @ {bet.game?.homeTeam}
            </div>
          </div>
          <OutcomeBadge outcome={bet.outcome} cashedOut={bet.cashedOut} />
        </div>
        <div style={{ display: "flex", gap: 10, fontSize: "0.72rem", color: "var(--text-3)", fontVariantNumeric: "tabular-nums" }}>
          <span>{fmtOdds(bet.odds)}</span>
          <span>stake {fmtMoney(bet.stake)}</span>
          {profit != null
            ? <span style={{ color: "var(--win)", fontWeight: 700 }}>{fmtMoney(profit, { sign: true })}</span>
            : <span>to win {fmtMoney(toWin)}</span>}
        </div>
      </div>
    );
  }

  // parlay
  const profit = bet.outcome === "WIN" ? Number(bet.payout) - Number(bet.stake) : null;
  return (
    <div className="card" style={{ padding: "11px 14px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 7 }}>
        <div style={{ fontWeight: 800, fontSize: "0.82rem" }}>{bet.legs?.length}-Leg Parlay</div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
          <OutcomeBadge outcome={bet.outcome} cashedOut={bet.cashedOut} />
          {profit != null && <span style={{ fontSize: "0.72rem", fontWeight: 700, color: "var(--win)" }}>{fmtMoney(profit, { sign: true })}</span>}
        </div>
      </div>
      <div style={{ fontSize: "0.68rem", color: "var(--text-3)", marginBottom: 6, fontVariantNumeric: "tabular-nums" }}>
        {fmtOdds(bet.totalOdds)} · stake {fmtMoney(bet.stake)}
      </div>
      <div style={{ borderTop: "1px solid var(--border)", paddingTop: 6 }}>
        {bet.legs?.map((leg: any, i: number) => (
          <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "4px 0" }}>
            <div style={{ fontSize: "0.72rem", color: "var(--text-2)", flex: 1, minWidth: 0, paddingRight: 8, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {leg.label}
            </div>
            <OutcomeBadge outcome={leg.outcome} />
          </div>
        ))}
      </div>
    </div>
  );
}

function TeamHeader({ side, align }: { side: any; align: "left" | "right" }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 12,
      flexDirection: align === "right" ? "row-reverse" : "row",
      textAlign: align,
    }}>
      <HelmetAvatar color={side.helmetColor} initials={(side.displayName || "??").slice(0, 2)} size={40} />
      <div style={{ minWidth: 0 }}>
        <div style={{ fontWeight: 900, fontSize: "1.05rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {side.displayName}
        </div>
        <div style={{ fontSize: "0.72rem", color: "var(--text-3)", fontVariantNumeric: "tabular-nums" }}>
          {side.wins}-{side.losses}-{side.ties}
        </div>
      </div>
    </div>
  );
}

export default function MatchupPage({ params }: PageProps<"/leagues/[leagueId]/matchup">) {
  const router = useRouter();
  const [leagueId, setLeagueId] = useState("");
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function init() {
      if (!localStorage.getItem("token")) { router.push("/"); return; }
      const { leagueId: lid } = await params;
      setLeagueId(lid);
      try {
        const res = await api(`/leagues/${lid}/matchup`);
        setData(res);
      } catch {} finally {
        setLoading(false);
      }
    }
    init();
  }, []);

  const me = data?.me;
  const opponent = data?.opponent;

  return (
    <div className="page-wide">
      <div style={{ marginBottom: 16 }}>
        <h1>Matchup</h1>
        {data?.weekNumber && <p className="subtitle">Week {data.weekNumber}</p>}
      </div>

      {loading && <div className="loading" style={{ height: "20vh" }}>Loading…</div>}

      {!loading && !data?.hasMatchup && (
        <div className="card">
          <div className="empty">
            <div className="empty-icon">🏈</div>
            <div className="empty-text">No matchup this week</div>
          </div>
        </div>
      )}

      {!loading && data?.hasMatchup && data.isBye && (
        <div className="card">
          <div className="empty">
            <div className="empty-icon">🛌</div>
            <div className="empty-text">You're on a bye this week</div>
          </div>
        </div>
      )}

      {!loading && data?.hasMatchup && !data.isBye && me && opponent && (
        <>
          {/* Matchup header */}
          <div className="card" style={{ padding: 0, overflow: "hidden", marginBottom: 20 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", padding: "18px 24px" }}>
              <TeamHeader side={me} align="left" />
              <TeamHeader side={opponent} align="right" />
            </div>
            <div style={{ borderTop: "1px solid var(--border)" }} />
            <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center", padding: "16px 24px", gap: 12 }}>
              <div style={{ textAlign: "left" }}>
                <div style={{ fontSize: "0.6rem", fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--text-3)", marginBottom: 3 }}>
                  Available Balance
                </div>
                <div style={{ fontSize: "0.9rem", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{fmtMoney(me.balance)}</div>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: "0.58rem", fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--text-3)", marginBottom: 2 }}>Projected</div>
                  <div style={{ fontSize: "1.9rem", fontWeight: 900, letterSpacing: "-0.02em", fontVariantNumeric: "tabular-nums" }}>{fmtMoney(me.projected)}</div>
                </div>
                <div style={{ color: "var(--text-3)", fontSize: "0.75rem", fontWeight: 700 }}>VS</div>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: "0.58rem", fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--text-3)", marginBottom: 2 }}>Projected</div>
                  <div style={{ fontSize: "1.9rem", fontWeight: 900, letterSpacing: "-0.02em", fontVariantNumeric: "tabular-nums" }}>{fmtMoney(opponent.projected)}</div>
                </div>
              </div>

              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: "0.6rem", fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--text-3)", marginBottom: 3 }}>
                  Available Balance
                </div>
                <div style={{ fontSize: "0.9rem", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{fmtMoney(opponent.balance)}</div>
              </div>
            </div>
          </div>

          {/* Two-column bet lists */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, alignItems: "start" }}>
            {([["me", me, "Your Bets"], ["opp", opponent, "Opponent's Bets"]] as const).map(([key, side, title]) => (
              <div key={key}>
                <div style={{ fontSize: "0.7rem", fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--text-3)", marginBottom: 10 }}>
                  {title}
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {side.bets.length === 0 && (
                    <div style={{ padding: "16px 2px", color: "var(--text-3)", fontSize: "0.78rem" }}>No bets here</div>
                  )}
                  {side.bets.map((bet: any) => (
                    <BetCard key={bet.id} bet={bet} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
