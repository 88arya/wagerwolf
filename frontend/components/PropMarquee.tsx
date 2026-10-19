"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { getTeamFullName, getTeamLogoUrl } from "@/lib/teamLogos";

type Totals = { lines: number; props: number };

type Board = { markets: Market[]; totals?: Totals };

type Market =
  | {
      kind: "prop";
      player: string;
      team: string;
      position: string;
      espnId: string;
      statType: string;
      line: number;
      odds: number;
      game: string;
    }
  | {
      kind: "team";
      team: string;
      market: string;
      label: string;
      odds: number;
      game: string;
    };

const ROWS = 4;

const LIMIT = 500;

const CARD_PITCH = 246;

const PX_PER_SECOND = 35;

/** American odds carry their sign; a positive price is meaningless without it. */
const fmtOdds = (n: number) => (n > 0 ? `+${n}` : String(n));

/** Matches PlayerAvatar's URL exactly - one CDN path, two places that build it. */
const headshot = (espnId: string) =>
  `https://a.espncdn.com/i/headshots/nfl/players/full/${espnId}.png`;

function Headshot({ espnId, onBroken }: { espnId: string; onBroken: () => void }) {
  return (
    <span className="pm-mark is-photo">
      <img src={headshot(espnId)} alt="" referrerPolicy="no-referrer" onError={onBroken} />
    </span>
  );
}

function Crest({ team }: { team: string }) {
  const [failed, setFailed] = useState(false);
  const logo = getTeamLogoUrl(team);

  if (!logo || failed) return <span className="pm-mark is-text">{team}</span>;

  // ESPN's CDN refuses any request carrying a Referer - see PlayerAvatar.
  return (
    <span className="pm-mark is-crest">
      <img src={logo} alt="" referrerPolicy="no-referrer" onError={() => setFailed(true)} />
    </span>
  );
}

function Card({ m, onBroken }: { m: Market; onBroken?: () => void }) {
  const isProp = m.kind === "prop";
  return (
    <div className="pm-card">
      <div className="pm-card-head">
        {isProp ? <Headshot espnId={m.espnId} onBroken={onBroken ?? (() => {})} /> : <Crest team={m.team} />}
        <div className="pm-id">
          <div className="pm-name">{isProp ? m.player : getTeamFullName(m.team)}</div>
          <div className="pm-game">{m.game}</div>
        </div>
      </div>

      <div>
        <div className="pm-stat">{isProp ? m.statType : m.market}</div>

        <div className="pm-line">
          <span className="pm-side">{isProp ? `Over ${m.line}` : m.label}</span>
          <span className="pm-odds">{fmtOdds(m.odds)}</span>
        </div>
      </div>
    </div>
  );
}

export default function PropMarquee() {
  const [markets, setMarkets] = useState<Market[]>([]);
  const [totals, setTotals] = useState<Totals | null>(null);
  const [broken, setBroken] = useState<Set<string>>(new Set());
  const stripRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let live = true;
    api(`/weeks/public/markets?limit=${LIMIT}`)
      .then((d: Board) => {
        if (!live) return;
        setMarkets(Array.isArray(d?.markets) ? d.markets : []);
        setTotals(d?.totals ?? null);
      })
      .catch(() => { /* an unpriced week is a valid state; the section hides */ });
    return () => { live = false; };
  }, []);

  useEffect(() => {
    const strip = stripRef.current;
    if (!strip || markets.length === 0) return;
    const mq = window.matchMedia("(max-width: 900px)");

    const park = () => {
      if (!mq.matches) return;
      strip.scrollLeft = Math.round(strip.scrollWidth / 2);
    };

    park();
    mq.addEventListener("change", park);
    return () => mq.removeEventListener("change", park);
  }, [markets.length, broken.size]);

  if (markets.length === 0) return null;

  const dealt: Market[][] = Array.from({ length: ROWS }, () => []);
  markets.forEach((m, i) => dealt[i % ROWS].push(m));

  const rows = dealt
    .map((cards, i) => ({
      i,
      cards: cards.filter((m) => m.kind !== "prop" || !broken.has(m.espnId)),
    }))
    .filter((r) => r.cards.length > 0);

  if (rows.length === 0) return null;

  return (
    <>
      <div className="lp-sec-head">
        <h2 className="lp-sec-title">
          Place wagers on every game.
          <span className="lp-sec-title-2">Parlay your bets for bigger payouts.</span>
        </h2>
      </div>

      <div className="pm" aria-hidden="true" ref={stripRef}>
      {rows.map(({ i, cards }) => (
        <div className="pm-row" key={i}>
          <div
            className={`pm-track pm-track-${i}`}
            style={{ animationDuration: `${(cards.length * CARD_PITCH) / PX_PER_SECOND}s` }}
          >
            {[...cards, ...cards].map((m, j) => (
              <Card
                key={`${m.kind}-${m.kind === "prop" ? m.player : m.label}-${j}`}
                m={m}
                onBroken={m.kind === "prop"
                  ? () => setBroken((prev) => new Set(prev).add(m.espnId))
                  : undefined}
              />
            ))}
          </div>
        </div>
      ))}
      </div>

      {totals && (
        <div className="pm-foot">
          <span className="pm-total-label">Total markets:</span>
          <span className="pm-total-count">
            {(totals.lines + totals.props).toLocaleString()}
          </span>
        </div>
      )}
    </>
  );
}
