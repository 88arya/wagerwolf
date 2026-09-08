"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { getTeamFullName, getTeamLogoUrl } from "@/lib/teamLogos";

/**
 * Three rows of this week's real board, drifting right.
 *
 * THE DATA IS THE POINT. Every card is an actual market on this week's slate,
 * read through `GET /weeks/public/markets` from the same tables a signed-in
 * user bets into — priced by the sportsbook feed and repriced by the odds
 * poller as kickoff approaches. Nothing here is illustrative, which is what
 * makes the section an argument rather than a mockup.
 *
 * TWO CARD KINDS, and each carries the artwork its subject deserves: a player
 * prop gets the player's ESPN headshot, a team market gets the team's crest.
 * Giving both a crest would lose the thing that distinguishes them at a glance,
 * which is the whole reason the mix is worth showing.
 *
 * ORDER IS SHUFFLED SERVER-SIDE ON EVERY REQUEST, over a pool that is fixed
 * for the week - so a reload rearranges the same board rather than showing a
 * different one. That also removed the interleave this used to depend on: the
 * ratio of props to team cards had to stay coprime with ROWS or every team card
 * landed in one row, and a shuffled list cannot line up with anything.
 *
 * THE POOL ROTATES ONCE A WEEK, not on a timer. The server holds one sample per week
 * and swaps it when Week.resolved flips on the Tuesday resolve; this fetches
 * once on mount. Polling was the first version and it was wrong late in the
 * week — markets leave the board as they settle, so a re-picked sample drains
 * toward empty by Monday. See services/publicMarkets.
 *
 * It costs no SportsGameOdds budget either way: the endpoint reads our own
 * database, and the monthly cap is spent server-side by the poller alone.
 *
 * THE ANIMATION IS PURE CSS on a keyed row, so nothing about a re-render can
 * restart it — the trap the games strip documented at length, where a poll
 * replaced the week object and cascaded through effects until the ticker jumped
 * every 60s. Do not move the animation into React state.
 */

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

/* FOUR ROWS, and this number is no longer coupled to anything on the server.
   It used to be: the server emitted a fixed ratio of props to team cards and
   these were dealt round-robin, so the ratio's period had to stay coprime with
   ROWS or every team card landed in one row. That broke twice - 2:1 into 3
   rows, then 3:1 into 4 - before the interleave was replaced by a shuffle,
   which cannot line up with anything. Change this freely now. */
const ROWS = 4;

/* EVERYTHING THE WEEK HAS. The server caps at 500 to stop a malformed query
   asking it to serialise the board; the real answer is the number of players
   with a headshot plus one card per game, around 284 in week 1. */
const LIMIT = 500;

/* ONE CARD PLUS ITS GAP, matching .pm-card's 232px width and .pm-track's 14px
   gap in globals.css. Duplicated from the stylesheet because the duration below
   has to be computed in JS and there is no way to read a rule from here — if
   either value changes there, change it here. */
const CARD_PITCH = 246;

/* The pace the marquee ran at when it carried ten cards a row: 2460px of travel
   over 70 seconds. It is held CONSTANT as the card count grows, which is the
   whole reason the duration is computed rather than written down - the track
   widens with the number of cards, so a fixed 70s would make a fuller board
   scroll proportionally faster and read as a different design. */
const PX_PER_SECOND = 35;

/** American odds carry their sign; a positive price is meaningless without it. */
const fmtOdds = (n: number) => (n > 0 ? `+${n}` : String(n));

/** Matches PlayerAvatar's URL exactly — one CDN path, two places that build it. */
const headshot = (espnId: string) =>
  `https://a.espncdn.com/i/headshots/nfl/players/full/${espnId}.png`;

/**
 * The player's headshot, drawn the way the bet page draws it.
 *
 * COPIED FROM PlayerAvatar, deliberately and exactly: a 6px tile on
 * --surface-3, the image `contain` inside it, scaled 1.5x from the CENTRE. Two
 * near-misses came first and both looked wrong - `cover` with a top origin
 * crops into the head, and plain `contain` with no scale leaves the player
 * adrift in the middle of the box. ESPN frames these with a lot of transparent
 * margin, and contain-then-scale is what eats the margin instead of the person.
 *
 * If PlayerAvatar's treatment changes, change this too. It is not imported
 * because that component resolves images lazily through an AUTHENTICATED route
 * (GET /players/:id/image) and takes a playerId this page deliberately does not
 * receive - so it would fetch on every card and 401 on every one.
 *
 * The initial is the fallback, as it is there: only players with an espnId are
 * sampled, so the URL should resolve, but ESPN can still 404 and a broken-image
 * glyph on the landing page is worse than a letter.
 */
function Headshot({ espnId, onBroken }: { espnId: string; onBroken: () => void }) {
  return (
    <span className="pm-mark is-photo">
      {/* ESPN's CDN refuses any request carrying a Referer — see PlayerAvatar.
          onError lifts the failure to the marquee, which removes the card
          entirely rather than showing a placeholder in a row of faces. */}
      <img src={headshot(espnId)} alt="" referrerPolicy="no-referrer" onError={onBroken} />
    </span>
  );
}

function Crest({ team }: { team: string }) {
  const [failed, setFailed] = useState(false);
  const logo = getTeamLogoUrl(team);

  // The abbreviation is the fallback, not an empty box. Two ways to reach it:
  // teamLogos maps nothing (it maps all 32, so this is defensive), or the CDN
  // does not serve the file. A team card is NOT dropped the way a prop card is
  // when its image fails — the crest is decoration on a card whose subject is
  // the team name beside it, where the headshot IS the prop card's subject.
  if (!logo || failed) return <span className="pm-mark is-text">{team}</span>;

  // ESPN's CDN refuses any request carrying a Referer — see PlayerAvatar.
  return (
    <span className="pm-mark">
      <img
        src={logo}
        alt=""
        width={24}
        height={24}
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
      />
    </span>
  );
}

function Card({ m, onBroken }: { m: Market; onBroken?: () => void }) {
  const isProp = m.kind === "prop";
  return (
    <div className="pm-card">
      <div className="pm-card-head">
        {/* A cut-out headshot needs an edge to sit against, so it keeps a tile;
            the crest does not, being a silhouette already. Same split /home's
            cards make between PlayerAvatar and .hp-mark. */}
        {isProp ? <Headshot espnId={m.espnId} onBroken={onBroken ?? (() => {})} /> : <Crest team={m.team} />}
        {/* NAME ONLY. A prop card carried "LAR · WR" under the player and a
            team card repeated its own market - both were saying again what the
            picture and the line below already say.

            The team's FULL name, not the abbreviation: the crest and the book's
            own label ("SEA ML") both already carry the short form, so spelling
            it out is the one place the card can say who this is rather than
            abbreviating it a third time. */}
        <span className="pm-name">
          {isProp ? m.player : getTeamFullName(m.team)}
        </span>
      </div>

      {/* PROPS ONLY. A prop needs its market named - "receiving yards" is not
          derivable from anything else on the card. A team card's market is
          already in the label below it ("SEA ML", "SEA -3.5"), so an eyebrow
          reading "Moneyline" over it was the same word twice. */}
      {isProp && <div className="pm-stat">{m.statType}</div>}

      <div className="pm-line">
        {/* A prop quotes ONE SIDE — Prop.odds is the over and the under is not
            stored — so the card names the side. A team market has the book's
            own label, which already reads as a bet ("SEA -3.5", "SEA ML"). */}
        <span className="pm-side">{isProp ? `Over ${m.line}` : m.label}</span>
        <span className="pm-odds">{fmtOdds(m.odds)}</span>
      </div>

      {/* NO FIXTURE LINE. It read "DAL @ NYG" under every card, which is the
          least interesting thing on a card whose subject is a player or a team -
          and five rows of it turned the section into a wall of small grey text.
          The `game` field still arrives from the API; nothing renders it. */}
    </div>
  );
}

export default function PropMarquee() {
  const [markets, setMarkets] = useState<Market[]>([]);
  /* Headshots ESPN did not serve. An espnId on the row only says we resolved
     one, not that the CDN has the image - so a card can still come up blank.
     The card is DROPPED rather than falling back to an initial: every other
     card carries a face, and the one letter in a row of photographs reads as a
     failure rather than as a variant. */
  const [broken, setBroken] = useState<Set<string>>(new Set());

  // FETCHED ONCE, NOT POLLED. The server rotates this sample once a week, when
  // Week.resolved flips on the Tuesday resolve, so a timer would spend requests
  // to be handed the identical payload for six days. A visitor who leaves the
  // tab open across a Tuesday sees last week's board until they reload, which
  // is the right trade for a marketing surface.
  useEffect(() => {
    let live = true;
    api(`/weeks/public/markets?limit=${LIMIT}`)
      .then((d: Market[]) => { if (live) setMarkets(Array.isArray(d) ? d : []); })
      .catch(() => { /* an unpriced week is a valid state; the section hides */ });
    return () => { live = false; };
  }, []);

  // Empty is a real state — a week the feed has not priced has no markets — and
  // the honest rendering is nothing at all rather than placeholder cards
  // pretending to be a board.
  if (markets.length === 0) return null;

  // DEAL FIRST, FILTER SECOND, and that order is load bearing. Filtering the
  // flat list before dealing meant one broken headshot shifted every card after
  // it across row boundaries — a single failed image re-dealt all four rows and
  // changed all four durations, so the section visibly reshuffled itself as
  // images resolved. Dealing first pins each card to a row, so a removal only
  // shortens the row it was in.
  //
  // Round-robin rather than slicing into blocks, so a short sample still fills
  // every row instead of leaving the last ones empty. The server shuffles, so
  // each row gets a mix of both kinds.
  const dealt: Market[][] = Array.from({ length: ROWS }, () => []);
  markets.forEach((m, i) => dealt[i % ROWS].push(m));

  // The row's ORIGINAL index is carried through, because .pm-track-N supplies
  // that row's stagger. Re-indexing after the filter below would slide the
  // margins onto different rows the moment any row emptied.
  const rows = dealt
    .map((cards, i) => ({
      i,
      cards: cards.filter((m) => m.kind !== "prop" || !broken.has(m.espnId)),
    }))
    // An empty row would still render its wrapper and claim a gap, and its
    // computed duration would be 0s, which is not a valid animation.
    .filter((r) => r.cards.length > 0);

  if (rows.length === 0) return null;

  return (
    <div className="pm" aria-hidden="true">
      {rows.map(({ i, cards }) => (
        <div className="pm-row" key={i}>
          {/* The list twice. The track is translated by exactly half its width,
              so the second copy is under the cursor at the moment the first runs
              out — which is what makes the loop seamless rather than a jump back
              to the start. */}
          {/* Duration per row, not in CSS: it depends on how many cards the row
              holds, and only React knows that. Each row computes its own, which
              keeps the PACE identical everywhere - rows can differ by a card
              once a broken headshot is dropped, and a shared duration would
              then mean a shorter row moving slower. They can drift out of phase
              as a result; that is fine, because the stagger is a margin (see
              .pm-track-N) and not a phase relationship. */}
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
  );
}
