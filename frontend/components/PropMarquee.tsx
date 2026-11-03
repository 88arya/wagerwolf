"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { getTeamFullName, getTeamLogoUrl } from "@/lib/teamLogos";
import { headshotUrl } from "@/lib/espnImage";

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

// Every market is drawn twice (the loop needs a second copy), so this caps the DOM
// at 240 cards on a busy week.
const LIMIT = 120;

const CARD_PITCH = 246;

const PX_PER_SECOND = 35;

/** American odds carry their sign; a positive price is meaningless without it. */
const fmtOdds = (n: number) => (n > 0 ? `+${n}` : String(n));

// .pm-mark is 36px with a 1px border, and the photo is 150% of the 34px inside.
const PHOTO_CSS_W = 51;
const CREST_CSS = 20;

// The mark shimmers until its image has decoded, then the image fades in, so
// a card is whole from the first frame and nothing pops into it.
function Headshot({ espnId, show, onBroken }: { espnId: string; show: boolean; onBroken: () => void }) {
  const [loaded, setLoaded] = useState(false);
  return (
    <span className={`pm-mark is-photo${loaded ? "" : " pm-skel"}`}>
      {show && <img
        src={headshotUrl(espnId, PHOTO_CSS_W)}
        alt=""
        referrerPolicy="no-referrer"
        decoding="async"
        className={loaded ? "is-loaded" : undefined}
        onLoad={() => setLoaded(true)}
        onError={onBroken}
      />}
    </span>
  );
}

function Crest({ team, show }: { team: string; show: boolean }) {
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const logo = getTeamLogoUrl(team, CREST_CSS);

  if (!logo || failed) return <span className="pm-mark is-text">{team}</span>;

  // ESPN's CDN refuses any request carrying a Referer - see PlayerAvatar.
  return (
    <span className={`pm-mark is-crest${loaded ? "" : " pm-skel"}`}>
      {show && <img
        src={logo}
        alt=""
        referrerPolicy="no-referrer"
        decoding="async"
        className={loaded ? "is-loaded" : undefined}
        onLoad={() => setLoaded(true)}
        onError={() => setFailed(true)}
      />}
    </span>
  );
}

function Card({ m, show, onBroken }: { m: Market; show: boolean; onBroken?: () => void }) {
  const isProp = m.kind === "prop";
  return (
    <div className="pm-card">
      <div className="pm-card-head">
        {isProp
          ? <Headshot espnId={m.espnId} show={show} onBroken={onBroken ?? (() => {})} />
          : <Crest team={m.team} show={show} />}
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

const SKELETON_PER_ROW = 12;

function SkeletonCard() {
  return (
    <div className="pm-card is-skeleton">
      <div className="pm-card-head">
        <span className="pm-mark pm-skel" />
        <div className="pm-id">
          <div className="pm-bar pm-skel" style={{ width: "72%", height: 10 }} />
          <div className="pm-bar pm-skel" style={{ width: "48%", height: 8, marginTop: 6 }} />
        </div>
      </div>
      <div>
        <div className="pm-bar pm-skel" style={{ width: "40%", height: 8 }} />
        <div className="pm-line">
          <div className="pm-bar pm-skel" style={{ width: "46%", height: 12 }} />
          <div className="pm-bar pm-skel" style={{ width: "18%", height: 12 }} />
        </div>
      </div>
    </div>
  );
}

function Heading() {
  return (
    <div className="lp-sec-head">
      <h2 className="lp-sec-title">
        Place wagers on every game.
        <span className="lp-sec-title-2">Parlay your bets for bigger payouts.</span>
      </h2>
    </div>
  );
}

export default function PropMarquee() {
  // null while the request is in flight, which is what the skeleton draws for.
  const [markets, setMarkets] = useState<Market[] | null>(null);
  const [totals, setTotals] = useState<Totals | null>(null);
  const [broken, setBroken] = useState<Set<string>>(new Set());
  const [showImages, setShowImages] = useState(false);
  const stripRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let live = true;
    api(`/weeks/public/markets?limit=${LIMIT}`)
      .then((d: Board) => {
        if (!live) return;
        setMarkets(Array.isArray(d?.markets) ? d.markets : []);
        setTotals(d?.totals ?? null);
      })
      .catch(() => { if (live) setMarkets([]); /* the section hides, as on an unpriced week */ });
    return () => { live = false; };
  }, []);

  // Images load as one batch once the strip is within 1.5 screens (it sits
  // ~1.2 down on desktop and phones, so in practice: right after load), never
  // before the window's load event, so they cannot compete with the hero.
  // Not loading="lazy": that judges each image against its clipping row, so a
  // card would only start loading as it slid into view.
  // The root is .app-scroll, not the window: the page scrolls inside it, and a
  // rootMargin on the default root is clipped by that scroller, so nothing
  // counted as near until it was actually on screen.
  const count = markets?.length ?? 0;
  useEffect(() => {
    const strip = stripRef.current;
    if (!strip || count === 0 || showImages) return;
    let io: IntersectionObserver | null = null;
    const watch = () => {
      io = new IntersectionObserver((entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setShowImages(true);
          io?.disconnect();
        }
      }, { root: strip.closest(".app-scroll"), rootMargin: "150% 0px" });
      io.observe(strip);
    };
    if (document.readyState === "complete") watch();
    else window.addEventListener("load", watch, { once: true });
    return () => {
      window.removeEventListener("load", watch);
      io?.disconnect();
    };
  }, [count, showImages]);

  useEffect(() => {
    const strip = stripRef.current;
    if (!strip || count === 0) return;
    const mq = window.matchMedia("(max-width: 900px)");

    const park = () => {
      if (!mq.matches) return;
      strip.scrollLeft = Math.round(strip.scrollWidth / 2);
    };

    park();
    mq.addEventListener("change", park);
    return () => mq.removeEventListener("change", park);
  }, [count, broken.size]);

  if (markets === null) {
    return (
      <>
        <Heading />
        <div className="pm" aria-hidden="true">
          {Array.from({ length: ROWS }, (_, i) => (
            <div className="pm-row" key={i}>
              <div className={`pm-track pm-track-${i} is-skeleton`}>
                {Array.from({ length: SKELETON_PER_ROW }, (_, j) => <SkeletonCard key={j} />)}
              </div>
            </div>
          ))}
        </div>
        <div className="pm-foot">
          <span className="pm-bar pm-skel" style={{ width: 150, height: 21 }} />
        </div>
      </>
    );
  }

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
      <Heading />

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
                show={showImages}
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
