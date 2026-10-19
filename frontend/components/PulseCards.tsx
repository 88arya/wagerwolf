"use client";

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

/** Which artwork a card's rows carry. Games get none - the fixture is the label. */
type Kind = "player" | "team" | "game";

type Metric = "bets" | "profit" | "lost";

const METRIC_LABEL: Record<Metric, string> = {
  bets: "Bets",
  profit: "Paid out",
  lost: "Lost",
};

function Mark({ kind, row }: { kind: Kind; row: Row }) {
  if (kind === "player") {
    return <PlayerAvatar playerId={row.key} imageUrl={row.imageUrl} name={row.label} size={36} />;
  }

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
  // ESPN's CDN refuses any request carrying a Referer - see PlayerAvatar.
  return <img src={logo} alt="" width={size} height={size} referrerPolicy="no-referrer" />;
}

function Card({
  eyebrow, rows, kind, metric, blank,
}: {
  eyebrow: string;
  rows: Row[];
  kind: Kind;
  metric: Metric;
  /** Render the card's shape with no values in it. */
  blank?: boolean;
}) {
  const lead = rows[0];

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

  const sub = kind === "game" ? GAME_STATUS[lead.sublabel ?? ""] ?? null : lead.sublabel;

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
