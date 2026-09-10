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

/* THE RESPONSE IS AN OBJECT, not a bare array. `totals` counts every available
   line and prop on the week — thousands — where `markets` is the ~285-card
   sample drawn from them. The two answer different questions, which is why the
   sample's own length cannot stand in for the count. */
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
 * The player's headshot in the card's bordered tile.
 *
 * PlayerAvatar's exact treatment — `contain`, then scaled 1.5x from the centre.
 * ESPN frames these with a lot of transparent margin around a player who is not
 * centred in it, and contain-then-scale eats that margin. `cover` was tried here
 * and looked unsteady: it fills the short side, so the tile shows the full-height
 * middle band including the margin, and the margin differs per photo. See
 * .pm-mark.is-photo img in globals.css.
 *
 * It is not imported from PlayerAvatar even so: that component resolves
 * images lazily through an AUTHENTICATED route (GET /players/:id/image) and
 * takes a playerId this page deliberately does not receive — so it would fetch
 * on every card and 401 on every one.
 *
 * There is no fallback. Only players with an espnId are sampled, so the URL
 * should resolve; when ESPN still 404s, onBroken removes the card from the list
 * entirely rather than leaving a letter in a row of faces.
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
    <span className="pm-mark is-crest">
      <img src={logo} alt="" referrerPolicy="no-referrer" onError={() => setFailed(true)} />
    </span>
  );
}

/**
 * ONE LAYOUT FOR BOTH KINDS, per the Figma spec.
 *
 * Four slots, top to bottom: mark + name, the fixture under the name, the
 * market as an eyebrow, and the line against its price. A prop fills them with
 * the player, his stat and "Over 62.5"; a team market with the team,
 * "Moneyline" or "Spread", and the book's own label. They used to diverge —
 * the eyebrow was prop-only and neither carried a fixture — which is what made
 * the two heights differ by 22px.
 */
function Card({ m, onBroken }: { m: Market; onBroken?: () => void }) {
  const isProp = m.kind === "prop";
  return (
    <div className="pm-card">
      <div className="pm-card-head">
        {/* Same bordered tile either way now; what differs is what goes in it —
            a headshot fills its frame, a crest sits smaller and centred. */}
        {isProp ? <Headshot espnId={m.espnId} onBroken={onBroken ?? (() => {})} /> : <Crest team={m.team} />}
        <div className="pm-id">
          {/* The team's FULL name, not the abbreviation: the crest and the
              book's own label ("SEA ML") both already carry the short form, so
              this is the one place the card can say who it is in full. */}
          <div className="pm-name">{isProp ? m.player : getTeamFullName(m.team)}</div>
          <div className="pm-game">{m.game}</div>
        </div>
      </div>

      <div>
        {/* The market, named on both kinds — "receiving yards" is not derivable
            from anything else on a prop card, and pairing it with a team card's
            "Moneyline" is what makes the two read as one layout. */}
        <div className="pm-stat">{isProp ? m.statType : m.market}</div>

        <div className="pm-line">
          {/* A prop quotes ONE SIDE — Prop.odds is the over and the under is not
              stored — so the card names the side. A team market has the book's
              own label, which already reads as a bet ("SEA -3.5", "SEA ML"). */}
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
      .then((d: Board) => {
        if (!live) return;
        setMarkets(Array.isArray(d?.markets) ? d.markets : []);
        setTotals(d?.totals ?? null);
      })
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
    <>
      {/* THE HEADING LIVES HERE, not in app/page.tsx, for one reason: the
          subtitle's numbers come from the same response as the cards. Kept in
          the page it would need its own fetch, and the two could then disagree
          about which week they were describing.

          It also disappears with the section. Both early returns above are hit
          on a week the feed has not priced, and "This week: 0 lines" over a
          blank strip is worse than nothing at all. */}
      <div className="lp-sec-head">
        {/* TWO LINES, ONE HEADING. The second is the same 48px as the first
            and grey rather than black - the colour is what separates them, not
            the size, so they still read as one sentence in two beats. It is a
            <span> inside the h2 rather than a second element because it IS the
            heading; splitting it into a <p> made it a caption on the line
            above. */}
        <h2 className="lp-sec-title">
          Place wagers on every game.
          <span className="lp-sec-title-2">Parlay your bets for bigger payouts.</span>
        </h2>
      </div>

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

      {/* THE SIZE OF THE BOARD, under the corner of it. Lines plus props, which
          is every market a signed-in user can bet this week - not the ~285 the
          rows above sample, and the gap between the two numbers is the point:
          the strip is a window onto something much larger.

          OUTSIDE .pm, so the mask does not touch it. .pm fades its own edges to
          transparent at 12% and 88%, and a figure sitting in the right-hand
          fade would be the one piece of real information on the page rendered
          half-legible. */}
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
