"use client";

/**
 * The centre column's stat cards: what the whole platform is betting on.
 *
 * THIS WEEK is volume — the most bet player, team and game, each with the
 * number of wagers riding on it and the money staked. LAST WEEK is money: which
 * heavily-backed team came through and which fell short, and which player made
 * and lost the most for the people who bet him.
 *
 * Everything is platform-wide rather than league-scoped, which is the whole
 * point: your own league is three people, and "what is everyone on" is a
 * question a league cannot answer. Nothing here names a user.
 *
 * The three entities on the This week side deliberately nest — a game's numbers
 * include its teams' lines and its players' props — because they answer
 * different questions. They are not meant to reconcile, and the server's
 * homePulse.ts says so at more length.
 *
 * PURE RENDER — HomeBoard fetches. `which` picks the half: both are on the page
 * at once now, stacked, so this renders one grid rather than switching between
 * them. The week toggle that used to choose is gone.
 */

import PlayerAvatar from "./PlayerAvatar";
import { fmtDollars } from "@/lib/money";
import { getTeamLogoUrl, getTeamFullName } from "@/lib/teamLogos";

export type Row = {
  key: string;
  bets: number;
  wagered: number;
  label: string;
  sublabel: string | null;
  imageUrl?: string | null;
  profit?: number;
  lost?: number;
  /** Game rows only: the two teams, so both crests can be drawn. */
  away?: string | null;
  home?: string | null;
};

export type Pulse = {
  current: { week: number; players: Row[]; teams: Row[]; games: Row[] } | null;
  last: {
    week: number;
    teamsHit: Row[]; teamsMiss: Row[];
    playersProfit: Row[]; playersLost: Row[];
  } | null;
};

/** Game.status, as something worth printing. SCHEDULED is absent on purpose. */
const GAME_STATUS: Record<string, string> = { LIVE: "Live now", FINAL: "Final", CANCELLED: "Cancelled" };

/** Which artwork a card's rows carry. Games get none — the fixture is the label. */
type Kind = "player" | "team" | "game";

/**
 * The number a card ranks by, which is also the one it prints large.
 * `bets` for this week's three; `profit`/`lost` for last week's four, where
 * bets and handle drop to the line underneath.
 */
type Metric = "bets" | "profit" | "lost";

/** The caption over a card's first figure. Shared with the blank state, which
 *  is the whole reason it is a lookup rather than an inline ternary — a card
 *  with no data still has to say what the number would have been. */
const METRIC_LABEL: Record<Metric, string> = {
  bets: "Bets",
  profit: "Paid out",
  lost: "Lost",
};

function Mark({ kind, row }: { kind: Kind; row: Row }) {
  if (kind === "player") {
    return <PlayerAvatar playerId={row.key} imageUrl={row.imageUrl} name={row.label} size={36} />;
  }

  // A fixture gets BOTH crests, not one of them and not none. Without a mark the
  // game card started its text where the other two start their artwork, which
  // broke the line across a row of three; with one crest it would be claiming a
  // side the card is not about.
  if (kind === "game") {
    return (
      <span className="hp-mark is-pair">
        <Crest team={row.away} size={17} />
        <Crest team={row.home} size={17} />
      </span>
    );
  }

  return (
    <span className="hp-mark">
      <Crest team={row.key} size={24} />
    </span>
  );
}

function Crest({ team, size }: { team?: string | null; size: number }) {
  const logo = team ? getTeamLogoUrl(team) : null;
  if (!logo) return <span className="hp-mark-fallback">{team ?? "—"}</span>;
  // ESPN's CDN refuses any request carrying a Referer — see PlayerAvatar.
  return <img src={logo} alt="" width={size} height={size} referrerPolicy="no-referrer" />;
}

/**
 * One card: what the eyebrow asks, the single entity that answers it, and the
 * two numbers behind that answer. Nothing else.
 *
 * WHAT CAME OFF. A sentence at the bottom defining the card's own terms
 * ("Moneyline and spread only — not their players' props"), which reads as
 * confident on the first visit and as clutter on every one after; the
 * definitions live in services/homePulse.ts, where whoever needs them is. A
 * large number over a grey meta line, which spent the card's vertical budget on
 * one figure and repeated the other in prose. And a runners-up list — see the
 * note on ties in Card.
 */
function Card({
  eyebrow, rows, kind, metric, blank,
}: {
  eyebrow: string;
  rows: Row[];
  kind: Kind;
  metric: Metric;
  /** Render the card's shape with no values in it. See the `last` case below. */
  blank?: boolean;
}) {
  // ONE ENTITY PER CARD, and no list under it. The card's question is "which
  // one", and every attempt to also show the next few reintroduced the thing it
  // must not do: three teams on one bet each printed "1" three times, and after
  // that was fixed the two runners printed it twice between themselves. A list
  // of near-equal figures is a tie however it is filtered.
  //
  // Which entity holds the card is decided server-side — whoever reached the
  // leading figure FIRST keeps it, displaced only by something strictly higher.
  // See NO_TIES in services/homePulse.ts. Nothing is ranked on this side.
  const lead = rows[0];

  // A card with its structure and nothing in it, used before the first Tuesday
  // resolve. It replaced a sentence explaining that last week had not happened
  // yet, which said more than it needed to and left the row a different height
  // from every other row on the page. The captions still say what each figure
  // WILL be, so the card is legible before it has anything to report.
  if (blank) {
    return (
      <div className="hp-card">
        <div className="section-title hb-card-head">{eyebrow}</div>
        <div className="hp-lead">
          <span className="hp-mark is-blank" aria-hidden="true" />
          <span className="hp-lead-text"><span className="hp-name is-blank">&mdash;</span></span>
        </div>
        <dl className="hp-stats">
          <div>
            <dt>{METRIC_LABEL[metric]}</dt>
            <dd className="hp-stat-value is-blank">&mdash;</dd>
          </div>
          <div>
            <dt>Wagered</dt>
            <dd className="hp-stat-value is-blank">&mdash;</dd>
          </div>
        </dl>
      </div>
    );
  }

  if (!lead) {
    return (
      <div className="hp-card">
        <div className="section-title hb-card-head">{eyebrow}</div>
        <div className="hp-empty">No bets yet</div>
      </div>
    );
  }

  const name = kind === "team" ? getTeamFullName(lead.label) : lead.label;

  // Game rows carry Game.status. SCHEDULED is the default and says nothing —
  // every fixture is scheduled until it isn't — so it renders as no sublabel.
  const sub = kind === "game" ? GAME_STATUS[lead.sublabel ?? ""] ?? null : lead.sublabel;

  // Two figures, always, so the three cards in a row read as one instrument
  // rather than three. The first is what the card ranks by; the second is the
  // handle, which is the same question asked in money.
  const primary =
    metric === "bets" ? { value: String(lead.bets), tone: "" }
    : metric === "profit" ? { value: fmtDollars(lead.profit ?? 0), tone: " is-up" }
    : { value: fmtDollars(lead.lost ?? 0), tone: " is-down" };

  return (
    <div className="hp-card">
      <div className="section-title hb-card-head">{eyebrow}</div>

      <div className="hp-lead">
        <Mark kind={kind} row={lead} />
        <span className="hp-lead-text">
          <span className="hp-name">{name}</span>
          {sub && <span className="hp-sub">{sub}</span>}
        </span>
      </div>

      <dl className="hp-stats">
        <div>
          <dt>{METRIC_LABEL[metric]}</dt>
          <dd className={`hp-stat-value${primary.tone}`}>{primary.value}</dd>
        </div>
        <div>
          <dt>Wagered</dt>
          <dd className="hp-stat-value">{fmtDollars(lead.wagered)}</dd>
        </div>
      </dl>

    </div>
  );
}

export default function PulseCards({
  pulse, which, error,
}: {
  pulse: Pulse | undefined;
  which: "current" | "last";
  error: boolean;
}) {
  const showing = which === "current" ? pulse?.current ?? null : pulse?.last ?? null;

  if (!pulse) {
    return <div className="hp-empty">{error ? "Could not load this week's action." : "Loading…"}</div>;
  }

  // `last` is null for the whole of week 1 — nothing has resolved yet. The four
  // cards are drawn anyway, empty, rather than replaced by a line of text: the
  // page then has the same shape in week 1 as in week 5, and the reader learns
  // what will be there from the cards themselves.
  if (which === "last" && !showing) return lastGrid(null);

  if (!showing) return <div className="hp-empty">No week is open right now.</div>;

  if (which === "current") {
    const c = showing as NonNullable<Pulse["current"]>;
    return (
      <div className="hp-grid is-three">
        <Card eyebrow="Most bet player" kind="player" metric="bets" rows={c.players} />
        <Card eyebrow="Most bet team" kind="team" metric="bets" rows={c.teams} />
        <Card eyebrow="Most bet game" kind="game" metric="bets" rows={c.games} />
      </div>
    );
  }

  return lastGrid(showing as NonNullable<Pulse["last"]>);
}

/** The four last-week cards, with data or without it. */
function lastGrid(l: NonNullable<Pulse["last"]> | null) {
  const blank = l === null;
  return (
    <div className="hp-grid is-four">
      <Card eyebrow="Came through" kind="team" metric="bets" rows={l?.teamsHit ?? []} blank={blank} />
      <Card eyebrow="Fell short" kind="team" metric="bets" rows={l?.teamsMiss ?? []} blank={blank} />
      <Card eyebrow="Paid the most" kind="player" metric="profit" rows={l?.playersProfit ?? []} blank={blank} />
      <Card eyebrow="Cost the most" kind="player" metric="lost" rows={l?.playersLost ?? []} blank={blank} />
    </div>
  );
}
