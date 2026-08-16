"use client";

import { useRouter } from "next/navigation";

export default function HowToPlayPage() {
  const router = useRouter();

  return (
    <div className="page">
      <button
        className="ghost"
        onClick={() => router.back()}
        style={{ borderRadius: 0, padding: "5px 10px", fontSize: "0.8rem", marginBottom: 28, display: "flex", alignItems: "center", gap: 5, fontWeight: 800 }}
      >
        ‹ Back
      </button>

      <div style={{ maxWidth: 560 }}>
        <h1 style={{ marginBottom: 6 }}>How to Play</h1>
        <p style={{ color: "var(--text-2)", fontSize: "0.88rem", marginBottom: 36 }}>
          Wagerwolf is a fantasy football prop betting game. You bet fake money on real NFL player stats every week and compete against friends in a league.
        </p>

        <Section n="1" title="Join or Create a League">
          <p>Every game happens inside a league. Join a public league to get matched instantly with other players, or create a private league and invite your friends with a 6-letter code. Leagues run for the entire NFL regular season plus playoffs.</p>
        </Section>

        <Section n="2" title="Get Your Weekly Allowance">
          <p>At the start of each NFL week your balance resets to the league's weekly allowance — typically $300. This is your budget for the week. Unused money does not carry over. Your season balance tracks your total winnings across all weeks.</p>
        </Section>

        <Section n="3" title="Place Bets on Player Props">
          <p>Head to the Bet page and pick a game. You'll see player props for quarterbacks, running backs, receivers, defense, and kickers. Each prop is a stat line — for example, Patrick Mahomes passing yards set at 267.5. Bet Over or Under that number. Choose your stake and confirm.</p>
        </Section>

        <Section n="4" title="Build a Parlay">
          <p>Add multiple props to your parlay slip and your odds multiply together. A two-leg parlay at -110 each pays out at roughly +260. The more legs, the bigger the potential payout — and the higher the risk. All legs must win for the parlay to cash.</p>
        </Section>

        <Section n="5" title="Bet on Game Lines">
          <p>Beyond player props you can also bet on game outcomes: moneyline (who wins), spread (win by how much), or total (combined score over/under). These appear on the Game Lines tab for each matchup.</p>
        </Section>

        <Section n="6" title="Bets Lock at Kickoff">
          <p>Once a game starts, bets for that game are locked — no new picks and no cashouts. Make sure you're happy with your slip before kickoff.</p>
        </Section>

        <Section n="7" title="Results and Winnings">
          <p>Every Tuesday after the week's games finish, the app pulls official box scores and grades all bets automatically. Winning bets pay out at the stated odds. Your week's winnings are added to your season balance. Check the History page to see every bet you've ever placed.</p>
        </Section>

        <Section n="8" title="Head-to-Head Matchups">
          <p>Each week you're matched against one other player in your league. The player who wins more money that week wins the matchup. Your season record is tracked on the Leaderboard. At the end of the regular season the top players advance to the playoffs, and a league champion is crowned.</p>
        </Section>

        <div style={{ marginTop: 40, paddingTop: 24, borderTop: "1px solid var(--border)" }}>
          <p style={{ color: "var(--text-3)", fontSize: "0.8rem", fontWeight: 600 }}>
            All money is fake. This is for entertainment only.
          </p>
        </div>
      </div>
    </div>
  );
}

function Section({ n, title, children }: { n: string; title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 28 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 8 }}>
        <span style={{
          fontSize: "0.65rem", fontWeight: 800, color: "var(--accent)",
          background: "var(--accent-dim)", borderRadius: 0,
          padding: "2px 7px", letterSpacing: "0.05em",
        }}>
          {n}
        </span>
        <span style={{ fontWeight: 800, fontSize: "1rem" }}>{title}</span>
      </div>
      <div style={{ color: "var(--text-2)", fontSize: "0.88rem", lineHeight: 1.65, fontWeight: 500 }}>
        {children}
      </div>
    </div>
  );
}
