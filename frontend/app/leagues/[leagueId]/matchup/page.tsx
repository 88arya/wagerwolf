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

function Stat({ label, value, color, align }: { label: string; value: string; color?: string; align: "left" | "right" }) {
  return (
    <div style={{ textAlign: align }}>
      <div style={{ fontSize: "0.56rem", fontWeight: 800, letterSpacing: "0.07em", textTransform: "uppercase", color: "var(--text-3)", marginBottom: 2 }}>
        {label}
      </div>
      <div style={{ fontSize: "0.8rem", fontWeight: 700, fontVariantNumeric: "tabular-nums", color: color ?? "var(--text)" }}>
        {value}
      </div>
    </div>
  );
}

function BalanceBreakdown({ side, weeklyAllowance, balanceEdge, align }: { side: any; weeklyAllowance: number; balanceEdge: number; align: "left" | "right" }) {
  const netThisWeek = side.balance - weeklyAllowance;
  const vsOpponent = balanceEdge;
  const stats = [
    <Stat key="avail" label="Available Balance" value={fmtMoney(side.balance)} align={align} />,
    <Stat key="allow" label="Weekly Allowance" value={fmtMoney(weeklyAllowance)} align={align} />,
    <Stat key="net" label="Net This Week" value={fmtMoney(netThisWeek, { sign: true })} color={netThisWeek >= 0 ? "var(--win)" : "var(--loss)"} align={align} />,
    <Stat key="vsopp" label="vs Opponent" value={fmtMoney(vsOpponent, { sign: true })} color={vsOpponent >= 0 ? "var(--win)" : "var(--loss)"} align={align} />,
  ];
  return (
    // The right side swaps its pairs so the two breakdowns MIRROR about the
    // centre of the card: read outward-in, both sides run available, weekly /
    // net, vs-opponent, so each row holds the same two stats on both sides.
    //
    // That symmetry depends on there being two columns. Once .rg-2 collapses to
    // one on a phone the swap stops mirroring anything and simply puts the
    // rows out of order — "Available Balance" on the left sitting opposite
    // "Weekly Allowance" on the right, which in a side-by-side comparison is
    // actively misleading. .h2h-mirror undoes the swap at exactly the width
    // where the second column goes away.
    <div className={align === "right" ? "rg-2 h2h-mirror" : "rg-2"} style={{ display: "grid", gap: "10px 18px" }}>
      {align === "right" ? [stats[1], stats[0], stats[3], stats[2]] : stats}
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
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function init() {
      if (!localStorage.getItem("token")) { router.push("/"); return; }
      const { leagueId: lid } = await params;
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

  const margin = me && opponent ? me.projected - opponent.projected : 0;
  const isEven = margin === 0;
  const leaderName = margin > 0 ? me?.displayName : opponent?.displayName;
  const leaderColor = margin > 0 ? me?.helmetColor : opponent?.helmetColor;

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
            <div className="empty-text">You&apos;re on a bye this week</div>
          </div>
        </div>
      )}

      {!loading && data?.hasMatchup && !data.isBye && me && opponent && (
        <>
          {/* Matchup header */}
          <div className="card" style={{ padding: 0, overflow: "hidden", marginBottom: 20 }}>
            <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", padding: "18px 24px" }}>
              <TeamHeader side={me} align="left" />
              <TeamHeader side={opponent} align="right" />
            </div>
            <div style={{ borderTop: "1px solid var(--border)" }} />
            {/* me | projected | opponent.
                The middle track is `auto`, so it takes its CONTENT width — two
                1.9rem money figures plus a VS, about 250px. On a phone that
                leaves ~65px for each breakdown either side, and their labels
                ("AVAILABLE BALANCE", "WEEKLY ALLOWANCE") both overflow their
                track and print underneath the big numbers. .h2h-grid moves the
                projected pair onto its own full-width row below 760px and puts
                the two breakdowns side by side under it. */}
            <div className="h2h-grid" style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto minmax(0, 1fr)", alignItems: "center", padding: "16px 24px", gap: 12 }}>
              <BalanceBreakdown side={me} weeklyAllowance={data.weeklyAllowance} balanceEdge={me.balance - opponent.balance} align="left" />

              <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: "0.58rem", fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--text-3)", marginBottom: 2 }}>Projected</div>
                  <div className="h2h-num" style={{ fontSize: "1.9rem", fontWeight: 900, letterSpacing: "-0.02em", fontVariantNumeric: "tabular-nums" }}>{fmtMoney(me.projected)}</div>
                </div>
                <div style={{ color: "var(--text-3)", fontSize: "0.75rem", fontWeight: 700 }}>VS</div>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: "0.58rem", fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--text-3)", marginBottom: 2 }}>Projected</div>
                  <div className="h2h-num" style={{ fontSize: "1.9rem", fontWeight: 900, letterSpacing: "-0.02em", fontVariantNumeric: "tabular-nums" }}>{fmtMoney(opponent.projected)}</div>
                </div>
              </div>

              <BalanceBreakdown side={opponent} weeklyAllowance={data.weeklyAllowance} balanceEdge={opponent.balance - me.balance} align="right" />
            </div>
            <div style={{ borderTop: "1px solid var(--border)", padding: "10px 24px", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, background: "var(--surface-2)" }}>
              {isEven ? (
                <span style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--text-2)" }}>Toss-up — projected totals are even</span>
              ) : (
                <>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: leaderColor, flexShrink: 0 }} />
                  <span style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--text)" }}>
                    {leaderName} projected to win by <span style={{ color: ACCENT }}>{fmtMoney(Math.abs(margin))}</span>
                  </span>
                </>
              )}
            </div>
          </div>

          {/* Two-column bet lists */}
          <div className="rg-2" style={{ display: "grid", gap: 20, alignItems: "start" }}>
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
