"use client";

/**
 * The landing page's fourth section: the playoff format, drawn empty and filled
 * in by the scroll.
 *
 * WHAT IT ARGUES. The marquee says the odds are real; neither it nor the hero
 * says the season goes anywhere. This does — eight teams, three rounds
 * collapsing inward, one champion — and it ends on YOU, which is the only
 * reason to animate it rather than print it. A static bracket states a format.
 * A bracket that fills as you read it puts you at the end of one.
 *
 * THE NAMES ARE JOKES, AND THAT IS THE POINT. An earlier pass drew this with
 * seed numbers and no names, on the argument that every other section shows
 * real markets and invented content would be the one untrue thing on the page.
 * That argument does not apply to a fantasy team name: nobody reads "Jonathan
 * (Taylor's Version)" as a claim about anything. It reads as the tone of the
 * league you are being invited into, which is the one thing a bracket of
 * anonymous seed numbers could not say. Real player names, real odds and real
 * money figures are still out.
 *
 * ONE HELMET IS BLUE. Every other team is black, so the accent is not
 * decoration — it is the answer to "which one is me", and it is legible from
 * across the room before a single name has been read. This is also why the
 * winner's route is the only lit connector: the blue thread from a seed to the
 * centre is the whole sentence the graphic makes.
 *
 * IT IS ONE SVG, NOT A CSS GRID. A mirrored bracket is a geometry problem:
 * every elbow leaves one slot's edge at its exact centre and arrives at the
 * next round's, and the next round's centres are DEFINED as the midpoint of
 * the pair feeding them. In CSS that is a stack of flex columns whose
 * `space-around` gaps agree by luck; in a viewBox it is arithmetic (see LAYOUT)
 * and the whole thing scales with `width: 100%` for free.
 *
 * THE SCROLL IS MEASURED OFF THE TRACK, NOT off window.scrollY. `.app-scroll`
 * is this app's scrollport, not the window (see CLAUDE.md → Scroll
 * architecture), so a window scroll position would be 0 forever. A
 * `getBoundingClientRect()` on the track is agnostic about which ancestor
 * moved, and the listener is registered in the CAPTURE phase on `document`
 * because scroll events do not bubble — a listener on `window` never hears
 * `.app-scroll` scrolling.
 */

import { useEffect, useRef, useState } from "react";
import {
  HELMET_MARK_ID,
  HELMET_MARK_W,
  HELMET_MARK_H,
} from "@/components/HelmetMark";
import type { IconifyIcon } from "@iconify/react";
import { appAward, appHelmetFront } from "@/lib/icons";
import {
  WOLF_MARK,
  WOLF_MARK_X,
  WOLF_MARK_Y,
  WOLF_MARK_W,
  WOLF_MARK_H,
} from "@/components/Logo";

/* ── LAYOUT ────────────────────────────────────────────────────────────────
   The whole bracket in one coordinate space. Everything below is derived from
   these, so moving a column moves its elbows with it.

   SIX COLUMNS, mirrored, and the champion BELOW rather than between:

     seeds(4)  wildcard(2)  wagerbowl(1) | (1)  (2)  (4)
        L           L            L       |  R    R    R
                                CHAMPION
                          (centred, under the join)

   THE CENTRE COLUMN IS GONE, and that is what brought the width down. A
   champion sitting between the two finalists needs a whole column of its own
   plus two more elbow gaps — 150px that is empty on every row but one, and it
   pushed the diagram to 1528 where it overhung the page on ordinary windows.
   With the two finalists ADJACENT the Wagerbowl is a single hairline between
   them, the champion hangs below it on a short drop, and the box lands in the
   dead space under the middle of the bracket instead of adding width nothing
   else uses. Same picture, 150px narrower, and the composition is tighter for
   it.

   IT IS ON THE RAIL, at exactly 1220 — the same column as TopBar and the nav,
   so its edges line up with everything above it. Two earlier versions did not
   and had to say so: at 1528 and then 1378 it overhung the page, because one
   user unit renders as one pixel at the SVG's drawn width, so a name's budget
   is an ABSOLUTE number and every slot is the same box — the longest name set
   the width for all twelve, and six of those plus five gaps set W.

   WRAPPING IS WHAT BOUGHT THE WIDTH BACK. "Jonathan (Taylor's Version)" is 27
   characters on one line and needs a 213-wide slot; broken once it is 18 and
   needs 160. The card grew from 44 to 56 tall to hold the second line —
   vertical space the pin has spare, traded for horizontal space it did not.
   The helmet grew with it, which is the other half of the same trade: a taller
   card with a small mark in it looks empty.

   ONE BREAK, NOT TWO. 150 was tried and it forced that name onto three lines,
   which in a 56-tall card is a paragraph rather than a name. The 10px back is
   what buys the single break — measured, not guessed: "(Taylor's Version)" is
   ~91px, and 150 gave the text column 87.

   THE SLOTS AND THE GAPS TRADE AGAINST EACH OTHER at a fixed W, and the width
   freed by wrapping was spent on the GAPS rather than banked. At 185/22 the
   cards were chunky and the elbows were stubs between them; at 160/52 the runs
   are long enough to read as a bracket connecting things rather than as seams
   where two cards nearly touch. GAP is DERIVED from W and SLOT_W so the two
   halves always meet at the centre — tune SLOT_W alone and the gaps follow.
   ────────────────────────────────────────────────────────────────────────── */
const W = 1220;
const H = 400;

/** Baseline-to-column-top for every round label. ONE number, applied to all
 *  four, which is the whole point: the columns start at four different heights
 *  because the bracket funnels inward, so a shared label row sat 16px above the
 *  wildcard and 133px above the Wagerbowl. Reading them as a row was the
 *  mistake — each label belongs to its own column and steps down with it. */
const LABEL_GAP = 14;

/** Top of the outermost column. Everything vertical is measured from here. */
const SEEDS_TOP = 90;

/** ONE BOX FOR EVERY TEAM. The rounds used to narrow as they moved inward —
 *  230 wide at the seeds, 165 after — which made the bracket taper nicely and
 *  made the same team change size as it advanced. A team is a team in every
 *  round, and the taper was decoration bought at the cost of saying so. */
const SLOT_W = 160;
const SLOT_H = 56;

/** Fixed rather than a fraction of SLOT_H — the mark is sized to sit beside two
 *  lines of 12px text, which is a fact about the text, not about the box. */
const SLOT_HELMET = 36;

/** The champion is the ONE exception, and squarer rather than merely bigger,
 *  so it reads as a different kind of thing rather than a wider slot. */
const CHAMP = 130;

/** The elbow run between two columns — DERIVED, not chosen. Six slots and five
 *  gaps span W by definition, so this is whatever is left once SLOT_W is set;
 *  that identity is what guarantees the two halves meet exactly at the centre.
 *  At the current widths it is 64. */
const GAP = (W - 6 * SLOT_W) / 5;

/** Seed centre-to-centre. Everything vertical follows from this one number;
 *  78 leaves 22 between stacked cards. Deliberately much tighter than the
 *  horizontal GAP: a vertical neighbour is just the next team in the column,
 *  where a horizontal gap has a connector running through it and has to be
 *  long enough to show the right angle. */
const PITCH = 78;

/** The four left seeds, top to bottom. */
const SEED_Y = [0, 1, 2, 3].map((i) => SEEDS_TOP + SLOT_H / 2 + i * PITCH);
/** A round's slot sits at the midpoint of the pair feeding it. That rule,
 *  rather than a measured offset, is what keeps every elbow symmetrical. */
const R1_Y = [(SEED_Y[0] + SEED_Y[1]) / 2, (SEED_Y[2] + SEED_Y[3]) / 2];
const R2_Y = (R1_Y[0] + R1_Y[1]) / 2;

/** Left edges, left half. The right half is `W - x - width`, computed rather
 *  than written out, so the two sides cannot drift apart.
 *
 *  The columns are chained off GAP, and the two halves meet at the centre with
 *  exactly one GAP between the finalists only if W is 6×SLOT_W + 5×GAP:
 *  6×160 + 5×52 = 1220. GAP is derived from exactly that identity, so it holds
 *  for any SLOT_W. */
const SEED_X = 0;
const R1_X = SEED_X + SLOT_W + GAP;
const R2_X = R1_X + SLOT_W + GAP;

/** The champion, centred ABOVE the bracket rather than below it.
 *
 *  It was under the middle, on a drop from the Wagerbowl. Above is better for
 *  two reasons. The bracket funnels INWARD and the champion is where it ends,
 *  so the last line should leave the diagram rather than continue past it —
 *  and every round label now sits over its own column, which frees the centre
 *  entirely: there is no column at x = W/2, so the riser passes between the two
 *  Wagerbowl labels and crosses nothing. That was the exact collision that
 *  pushed the label below the box in the old arrangement.
 *
 *  The box clears the finalists' row, whose cards it would otherwise overlap on
 *  the right — 545–675 against a right finalist starting at 642. */
const CHAMP_X = (W - CHAMP) / 2;
const CHAMP_Y = 36;

/** Mid-gap x for each elbow's vertical run. */
const JOIN_1 = SEED_X + SLOT_W + GAP / 2;
const JOIN_2 = R1_X + SLOT_W + GAP / 2;

const mirror = (x: number, w: number) => W - x - w;

/** A label's baseline, given the top of the column it names. */
const labelY = (columnTop: number) => columnTop - LABEL_GAP;


/* ── THE TREE ──────────────────────────────────────────────────────────────
   Eight teams, top to bottom per side, and who comes out of each pair.

   THE TWO HALVES ARE DELIBERATELY NOT MIRROR IMAGES. YOU enter at the
   TOP of the left half and Dak to the future third down the right, so the two
   routes into the Wagerbowl arrive from opposite corners rather than tracing
   the same shape twice. A bracket whose two winners sit at the same height
   reads as a diagram of a bracket; one whose winners come from different
   places reads as a season that happened.

   Nothing here assumes which slot of a pair advances — `litLeg` finds it by
   name. An earlier version hardcoded "the lower one" and broke the moment YOU
   moved to the top.

   Any name may advance now. The rounds used to narrow, so a long name could
   sit in round one and not in round three; every slot is the same box, so
   that constraint is gone and the seeding is free.
   ────────────────────────────────────────────────────────────────────────── */
/** The visitor's own team, and the only accent on the board. Caps: it is the
 *  one slot that is not a team name but a pronoun, and setting it apart in
 *  case as well as in colour is what stops it being read as somebody's joke. */
const YOU = "YOU";

const LEFT_SEEDS = [
  YOU,
  "Jonathan (Taylor's Version)",
  "CDs TDs",
  "When Diggs fly",
];
const RIGHT_SEEDS = [
  "Like a good Nabors",
  "Miracle on Rice",
  "Dak to the future",
  // Caps, unlike every other name here: the joke is the digits standing in for
  // letters, and lowercase "5" sits below the x-height where it reads as a
  // typo. Set as a literal rather than text-transform so the string in this
  // file is the string on screen.
  "CEA5E AND DE5I5T",
];

/** Winners, top pair then bottom pair. */
const LEFT_R1 = [YOU, "When Diggs fly"];
const RIGHT_R1 = ["Miracle on Rice", "Dak to the future"];
const LEFT_R2 = YOU;
const RIGHT_R2 = "Dak to the future";

/**
 * Which leg of an elbow to light, by y — or null for a pair YOU are not in.
 * Found by NAME rather than by position, so moving a team up or down the
 * bracket needs no second edit here.
 */
const litLeg = (
  winner: string,
  topName: string,
  yTop: number,
  yBottom: number,
) => (winner !== YOU ? null : topName === winner ? yTop : yBottom);

/* ── THE REVEAL ────────────────────────────────────────────────────────────
   Scroll progress 0 → 1 across the track, cut into four stages. The last one
   lands at 0.80 rather than 1.0 on purpose: the remaining fifth is a HOLD, so
   the finished bracket is on screen for a beat before the pin releases. A
   reveal that completes on the last pixel of its own track is never seen.
   ────────────────────────────────────────────────────────────────────────── */
const STAGE_AT = [0.08, 0.32, 0.56, 0.8];

/* ── THE CHAMPION'S MARK — A BAKEOFF, NOT A DECISION ───────────────────────
   The champion's card carries a piece of artwork with the Wagerwolf mark set
   into it, in the slot where every other card carries a helmet. A helmet there
   said "a team", which is what the other fourteen cards already say; this says
   what the one card is FOR.

   WHICH artwork is undecided. Candidates are being drawn and judged one at a
   time, so they live in MARKS below and ACTIVE picks the one on screen —
   adding one is an entry, dropping one is deleting it, and the geometry of
   each is recorded rather than remembered. `design/champion-marks.md` carries
   the verdicts. Collapse this to a single constant once a winner is picked;
   until then, do not inline the active one.

   EVERY MEASUREMENT IS IN THE ARTWORK'S OWN COORDINATES, not in bracket units,
   because the candidates have wildly different boxes (500 for the wreath, 8
   for the pixel cup before it). `unit` below converts once, off the icon's own
   declared height, so an entry never has to know how big it is drawn.
   ────────────────────────────────────────────────────────────────────────── */
type ChampionMark = {
  /** Iconify data, from lib/icons. */
  icon: IconifyIcon;
  /** How big to draw it, in BRACKET units. */
  size: number;
  /** The Wagerwolf mark's height, in the ARTWORK's coordinates. Sized off the
   *  taller axis because the wolf is taller than it is wide.
   *
   *  OMIT IT FOR NO MARK AT ALL. Some artwork IS the mark — a helmet facing the
   *  reader says "you" on its own, and putting a wolf on it would be a badge on
   *  a badge. */
  crestH?: number;
  /** Where the Wagerwolf mark's centre sits, in the ARTWORK's coordinates. Its
   *  x is always the artwork's own centre, so only y is stated.
   *
   *  MAY BE NEGATIVE, which puts the mark ABOVE the artwork's box — the whole
   *  difference between a mark set into a frame and a mark crowning a solid
   *  shape. Nothing else in the entry changes; the card measures the union of
   *  the two boxes, so a crest outside the artwork simply makes the stack
   *  taller. See Champion. */
  crestY?: number;
  /** Space between the artwork and the "YOU" under it, in bracket units. */
  gap: number;
  /** The Wagerwolf mark's colour. Silver reads as one object with the artwork;
   *  accent reads as a mark ON it.
   *
   *  A CANDIDATE OWNS THIS, which is a concession — every other rule in this
   *  section describes the SLOT rather than the drawing in it, on the principle
   *  that a candidate needing its own CSS is not interchangeable with the
   *  others. But a mark standing beside a cup and a mark sitting on its face
   *  are not the same picture, and they do not want the same answer. It stays
   *  a two-value enum rather than a colour so it cannot grow into per-candidate
   *  styling. */
  crestTone?: "silver" | "accent";
};

const MARKS = {
  /**
   * IDEA 1 — a silver laurel wreath, the wolf standing in its opening.
   *
   * THE WREATH IS A FRAME, NOT A MEDAL, which is why the mark goes INSIDE it
   * rather than on it. Its two branches are separate subpaths — one entirely
   * left of x 201.5, one entirely right of 298.5 in its own 500-box — so the
   * column between them is open at every height. Measured by flattening the
   * path, not read off a design tool.
   *
   * THE OPENING IS WIDEST IN THE MIDDLE, as a wreath's is: ~131 units across
   * at y 60-100 where the branch tips nearly touch, ~364 at y 240-300, ~97 at
   * the very bottom where the stems cross. The wolf spans y 154-369 and is
   * ~175 wide, so it clears the narrowest part of that span by a wide margin
   * and never fouls a leaf.
   */
  award: { icon: appAward, size: 78, crestH: 215, crestY: 262, gap: 10 },

  /**
   * IDEA 2 — a solid cup, the wolf crowning it.
   *
   * ABOVE, NOT INSIDE, AND NOT BY CHOICE. This cup's ink fills its box — x 10
   * to 502, y 0 to 512, measured by flattening all three paths — and the only
   * holes in it are the two handles. Unlike the wreath there is no opening to
   * put anything in, so a mark laid over the bowl would be a sticker on a
   * silhouette. Above it is the honest reading: the wolf crowns the cup.
   *
   * THE CUP GIVES UP HEIGHT FOR IT. The card is 130 and the stack is artwork +
   * gap + "YOU", so a crest sitting outside the artwork's box comes out of the
   * artwork's own size: 54 here against the wreath's 78. Whether that trade is
   * worth it is the thing to judge.
   *
   * crestY -170 with crestH 247 puts the mark's foot 47 artwork units clear of
   * the rim — about 5 bracket units, the same air the name gets below.
   *
   * THE MEASUREMENTS SURVIVED AN ARTWORK SWAP. A narrower cup of the same
   * shape sat here first, in a 512.708 box against this one's 512. Nothing in
   * the entry moved, which is the point of stating everything in the artwork's
   * own coordinates.
   */
  /**
   * IDEA 4 — a helmet facing the reader, in the accent, and nothing else.
   *
   * NO WOLF ON IT, WHICH IS THE POINT. Two cup candidates and the wreath all
   * needed the mark because a trophy is a generic object — it says "someone
   * won" and nothing about who. A helmet is not generic here: every card on
   * this board wears one, so the champion wearing one too says "a team", and
   * the two things that make it THIS team are the ones already on the card —
   * the accent, and the word YOU under it. A wolf on top would be a badge on a
   * badge.
   *
   * IT FACES YOU, and every other helmet on the board faces its opponent —
   * the left half looks right, the right half looks left, and this one looks
   * out. That is the distinction the card is trading on, and it is why this
   * cannot be HelmetMark with the flip left off: that artwork is a side
   * profile and has no front.
   *
   * THE ONLY NON-SQUARE ARTWORK here, 229.6 x 275.4. `size` is therefore its
   * HEIGHT — see MARK_UNIT, which fits by the longer axis.
   */
  helmetFront: { icon: appHelmetFront, size: 86, gap: 8, crestTone: "accent" },
} satisfies Record<string, ChampionMark>;

const ACTIVE: ChampionMark = MARKS.helmetFront;

/**
 * Artwork coordinates → bracket coordinates.
 *
 * OFF THE LONGER AXIS, not off the height. SvgIcon draws into a SQUARE viewport
 * at the default `preserveAspectRatio`, so a non-square artwork fits by
 * whichever axis is larger and letterboxes the other. Dividing by the height
 * alone was right only while every candidate was square, and would have scaled
 * a wide one by the axis that was not fitted.
 */
const MARK_UNIT =
  ACTIVE.size / Math.max(ACTIVE.icon.width ?? 16, ACTIVE.icon.height ?? 16);
const CREST_H = (ACTIVE.crestH ?? 0) * MARK_UNIT;
const CREST_W = (CREST_H * WOLF_MARK_W) / WOLF_MARK_H;

/* ── WHERE A LINE COMES FROM ───────────────────────────────────────────────
   Every connector is drawn on with a dash offset, so the direction of its `d`
   is the direction it grows. That makes path direction a piece of the design
   rather than an implementation detail, and it has one rule:

     A LINE ALWAYS GROWS OUT OF SOMETHING ALREADY ON SCREEN.

   So within a round, three things happen in order, and the delays below are
   what put them in that order rather than all at once:

     1. Each team's LEG grows out of its own card and travels to the junction.
        Two legs, one per card, converging — not one stroke passing through.
     2. The JOIN pushes on from that junction into the next round's slot.
     3. The SLOT itself fades in, last, at the end of the line that arrived.

   The earlier version drew each bracket as a single stroke — out of the top
   card, down, and back INTO the bottom card — which animated as a line
   travelling from one opponent to the other. That is the wrong sentence: the
   two teams do not connect to each other, they both feed forward. Splitting it
   into two legs costs one extra path and states the actual relationship.
   ────────────────────────────────────────────────────────────────────────── */
const JOIN_DELAY = 0.28;
const SLOT_DELAY = 0.5;


export default function PlayoffReveal() {
  const trackRef = useRef<HTMLDivElement>(null);
  const pinRef = useRef<HTMLDivElement>(null);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const track = trackRef.current;
    const pin = pinRef.current;
    if (!track || !pin) return;

    // Nobody who asked not to be animated should have to scroll three screens
    // to read a bracket. The track collapses in CSS under the same query; this
    // is the other half, and it runs before the listener so the section paints
    // complete on the first frame.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setProgress(1);
      return;
    }

    let raf = 0;
    const measure = () => {
      raf = 0;
      const cs = getComputedStyle(pin);

      // NO PIN, NO REVEAL — and this test is the narrow layout's whole
      // enforcement. Below 900 the stylesheet takes the pin off
      // (`position: static`, `height: auto`) and the bracket is meant to be
      // simply shown, complete.
      //
      // That used to be inferred from `span <= 0` further down, and the
      // inference was WRONG BY A FRACTION OF A PIXEL. The track's height came
      // from getBoundingClientRect (fractional) and the pin's from
      // offsetHeight (rounded to an integer), so an unpinned section whose two
      // boxes are by definition the same height measured a span of ~0.5px
      // rather than 0. The guard did not fire, and dividing by half a pixel
      // made progress swing from 0 to 1 across one pixel of scroll — so on a
      // phone the bracket still filled itself in as you scrolled past, which
      // is the exact behaviour the narrow rules exist to remove.
      //
      // Asking the pin whether it is pinned cannot be off by a rounding error.
      if (cs.position !== "sticky") {
        setProgress(1);
        return;
      }

      // `top` is `var(--chrome-h)`, resolved to px — the line the pin sticks
      // at, and therefore the rect.top at which progress is exactly 0.
      const stickAt = parseFloat(cs.top) || 0;
      const rect = track.getBoundingClientRect();
      // BOTH HEIGHTS FROM THE SAME KIND OF MEASUREMENT. Mixing a fractional
      // rect height with a rounded offsetHeight is what produced the phantom
      // span above; the epsilon is belt and braces on top of that.
      const span = rect.height - pin.getBoundingClientRect().height;
      if (span <= 1) {
        setProgress(1);
        return;
      }
      const p = (stickAt - rect.top) / span;
      setProgress(p < 0 ? 0 : p > 1 ? 1 : p);
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(measure);
    };

    measure();
    // Capture phase: scroll does not bubble, so `.app-scroll` scrolling is
    // invisible to a listener bound on window.
    document.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    return () => {
      document.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  const on = (stage: number) => progress >= STAGE_AT[stage];

  return (
    <div className="pb-track" ref={trackRef}>
      <div className="pb-pin" ref={pinRef}>
        <div className="pb-head">
          {/* NO SUBTITLE. It read "Make the bracket, win three rounds, take the
              Wagerbowl." — which is the bracket's own three round labels in a
              sentence, under a picture of them. The heading now carries the
              stake and the diagram carries the format, which is the division
              the other sections on this page already use.

              TWO SENTENCES, TWO BEATS — the same shape the marquee heading
              above uses, and .lp-sec-title-2 is the same class it uses for it:
              48px like the first, grey instead of black, `display: block` to
              put it on its own line. The qualifier gets you in; the payoff is
              what you are in for.

              THE BREAK IS STRUCTURAL NOW, not a forced wrap. This was one
              sentence for a while, broken after "playoffs" by binding the rest
              with non-breaking spaces against the 900px cap — machinery that
              existed only to fake the line this markup states outright. No
              <br> either: Chrome treats one as a paragraph boundary and
              triple-clicking would select a single line instead of the whole
              heading (.lp-h1 carries the same note for the same reason). A
              block-level span is not a boundary. */}
          <h2 className="lp-sec-title">
            Earn your spot in the playoffs.
            <span className="lp-sec-title-2">
              Then be crowned champion of your league.
            </span>
          </h2>
        </div>

        <svg
          className="pb-svg"
          viewBox={`0 0 ${W} ${H}`}
          role="img"
          aria-label="Playoff bracket: eight teams, a wildcard round, a championship round, then the Wagerbowl, won by you."
        >
          {/* ── Round labels ─────────────────────────────────────────────── */}
          <Label x={SEED_X + SLOT_W / 2} y={labelY(SEEDS_TOP)} text="Wildcard" />
          <Label
            x={R1_X + SLOT_W / 2}
            y={labelY(R1_Y[0] - SLOT_H / 2)}
            text="Championship"
          />
          <Label
            x={R2_X + SLOT_W / 2}
            y={labelY(R2_Y - SLOT_H / 2)}
            text="Wagerbowl"
          />
          <Label
            x={mirror(R2_X, SLOT_W) + SLOT_W / 2}
            y={labelY(R2_Y - SLOT_H / 2)}
            text="Wagerbowl"
          />
          {/* The seventh label, identical to the six: same class, same size,
              same colour, same LABEL_GAP above its own column. A trophy icon
              was tried here and it was the odd one out — six words and a
              picture, on a row that only works because every entry is the same
              kind of thing. */}
          <Label x={W / 2} y={labelY(CHAMP_Y)} text="Champion" />

          <Label
            x={mirror(R1_X, SLOT_W) + SLOT_W / 2}
            y={labelY(R1_Y[0] - SLOT_H / 2)}
            text="Championship"
          />
          <Label
            x={mirror(SEED_X, SLOT_W) + SLOT_W / 2}
            y={labelY(SEEDS_TOP)}
            text="Wildcard"
          />

          {/* ── Connectors, under the slots so an elbow never crosses a rect.
                 Each is revealed with the round it feeds INTO, not the one it
                 leaves — a line arriving at an empty box reads as a bug. ── */}
          {[0, 1].map((pair) => (
            <Elbow
              key={`l1-${pair}`}
              from={[SEED_X + SLOT_W, SEED_Y[pair * 2], SEED_Y[pair * 2 + 1]]}
              joinX={JOIN_1}
              to={[R1_X, R1_Y[pair]]}
              shown={on(1)}
              litY={litLeg(
                LEFT_R1[pair],
                LEFT_SEEDS[pair * 2],
                SEED_Y[pair * 2],
                SEED_Y[pair * 2 + 1],
              )}
            />
          ))}
          {[0, 1].map((pair) => (
            <Elbow
              key={`r1-${pair}`}
              from={[
                mirror(SEED_X, SLOT_W),
                SEED_Y[pair * 2],
                SEED_Y[pair * 2 + 1],
              ]}
              joinX={W - JOIN_1}
              to={[mirror(R1_X, SLOT_W) + SLOT_W, R1_Y[pair]]}
              shown={on(1)}
              litY={null}
            />
          ))}
          <Elbow
            from={[R1_X + SLOT_W, R1_Y[0], R1_Y[1]]}
            joinX={JOIN_2}
            to={[R2_X, R2_Y]}
            shown={on(2)}
            litY={litLeg(LEFT_R2, LEFT_R1[0], R1_Y[0], R1_Y[1])}
          />
          <Elbow
            from={[mirror(R1_X, SLOT_W), R1_Y[0], R1_Y[1]]}
            joinX={W - JOIN_2}
            to={[mirror(R2_X, SLOT_W) + SLOT_W, R2_Y]}
            shown={on(2)}
            litY={null}
          />
          {/* THE WAGERBOWL. The finalists are adjacent, so the last round is
              the gap between them rather than a pair of runs into a column —
              but it is still TWO legs, one out of each finalist, meeting in the
              middle. Drawn as one stroke it animated as a line crossing from
              the left team to the right, which says they connect to each other
              rather than that they both arrive at the same place.

              Then the RISER, out of that meeting point and up into the
              champion. It is the last line on the board and the only vertical
              one, which is the point: everything else has been moving inward,
              and the season stops going sideways. Up rather than down because
              the champion sits above the bracket now — and because a line that
              leaves the top of the diagram ends it, where one continuing below
              looked like another round. */}
          <Run
            d={`M${R2_X + SLOT_W},${R2_Y} H${W / 2}`}
            shown={on(3)}
            lit={LEFT_R2 === YOU}
          />
          <Run
            d={`M${mirror(R2_X, SLOT_W)},${R2_Y} H${W / 2}`}
            shown={on(3)}
            lit={false}
          />
          <Run
            d={`M${W / 2},${R2_Y} V${CHAMP_Y + CHAMP}`}
            shown={on(3)}
            lit={LEFT_R2 === YOU}
            delay={JOIN_DELAY}
          />

          {/* ── Slots ─────────────────────────────────────────────────────── */}
          {LEFT_SEEDS.map((name, i) => (
            <Slot
              key={`ls-${i}`}
              x={SEED_X}
              y={SEED_Y[i] - SLOT_H / 2}
              w={SLOT_W}
              h={SLOT_H}
              name={name}
              shown={on(0)}
            />
          ))}
          {RIGHT_SEEDS.map((name, i) => (
            <Slot
              key={`rs-${i}`}
              x={mirror(SEED_X, SLOT_W)}
              y={SEED_Y[i] - SLOT_H / 2}
              w={SLOT_W}
              h={SLOT_H}
              name={name}
              shown={on(0)}
              flip
            />
          ))}
          {LEFT_R1.map((name, i) => (
            <Slot
              key={`l1s-${i}`}
              x={R1_X}
              y={R1_Y[i] - SLOT_H / 2}
              w={SLOT_W}
              h={SLOT_H}
              name={name}
              shown={on(1)}
              delay={SLOT_DELAY}
            />
          ))}
          {RIGHT_R1.map((name, i) => (
            <Slot
              key={`r1s-${i}`}
              x={mirror(R1_X, SLOT_W)}
              y={R1_Y[i] - SLOT_H / 2}
              w={SLOT_W}
              h={SLOT_H}
              name={name}
              shown={on(1)}
              delay={SLOT_DELAY}
              flip
            />
          ))}
          <Slot
            x={R2_X}
            y={R2_Y - SLOT_H / 2}
            w={SLOT_W}
            h={SLOT_H}
            name={LEFT_R2}
            shown={on(2)}
            delay={SLOT_DELAY}
          />
          <Slot
            x={mirror(R2_X, SLOT_W)}
            y={R2_Y - SLOT_H / 2}
            w={SLOT_W}
            h={SLOT_H}
            name={RIGHT_R2}
            shown={on(2)}
            delay={SLOT_DELAY}
            flip
          />

          {/* ── The champion. White like every other card, and marked out by
                 what is ON it rather than under it — an accent border, an
                 accent helmet, an accent name. The only helmet facing forward,
                 too: it is looking at nobody. ── */}
          <Champion shown={on(3)} delay={SLOT_DELAY} />
        </svg>

        {/* THE PHONE'S BRACKET. Both are in the DOM and a media query picks —
            no resize listener, no state, nothing that can render the wrong one
            for a frame after hydration. The hidden one costs a few dozen
            elements and no requests. See NarrowBracket for why a phone gets a
            different diagram rather than the same one scaled down. */}
        <NarrowBracket />
      </div>
    </div>
  );
}

/**
 * A name over one line, or two. NEVER three.
 *
 * There was a three-line pass, taken when the balanced two-line split still
 * looked too long. It only ever fired on "Jonathan (Taylor's Version)", and it
 * fired on a BAD MEASUREMENT: the budget was a character count, and that name's
 * long line is full of narrow glyphs — parentheses, an apostrophe, two `l`s and
 * an `i` — so 18 characters is ~91px where 18 average ones would be ~105. The
 * card was sized to the wrong number and the name broke twice to fit a limit
 * that was not real. Widening the card 10px and deleting the third line is the
 * fix; a name stacked three deep in a 56-tall card reads as a paragraph.
 *
 * BALANCED, NOT FILL-FIRST. Greedy wrapping puts as much as it can on the first
 * line and leaves a stub on the second, which in a box this narrow reads as a
 * mistake. This picks the split minimising the LONGER line, so "Like a good
 * Nabors" breaks near the middle rather than after "Like".
 *
 * Ties go to the earliest split, which is what keeps "Jonathan (Taylor's
 * Version)" breaking before the parenthesis rather than inside it.
 *
 * ONE_LINE_MAX IS MEASURED AGAINST SLOT_W, not chosen: the text column is
 * SLOT_W minus two pads, the helmet and the gap off it — 97px — and 14 average
 * characters at 12px is about 80. Narrow the card and it comes down with it. A
 * line that overruns does so in BOTH directions, since the text is centred, so
 * it reaches the helmet and the card edge at once rather than only the edge —
 * which at least makes the failure obvious rather than a quiet clip.
 */
const ONE_LINE_MAX = 14;

function wrapName(name: string): string[] {
  if (name.length <= ONE_LINE_MAX) return [name];
  const words = name.split(" ");
  if (words.length < 2) return [name];

  let best = [name];
  let bestScore = Infinity;
  for (let i = 1; i < words.length; i++) {
    const parts = [words.slice(0, i).join(" "), words.slice(i).join(" ")];
    const score = Math.max(parts[0].length, parts[1].length);
    if (score < bestScore) {
      bestScore = score;
      best = parts;
    }
  }
  return best;
}

/**
 * An Iconify icon placed inside an SVG.
 *
 * NOT `<Icon>` FROM @iconify/react — that component is for HTML, and inside an
 * <svg> it is doubly wrong: it renders an empty <span> placeholder before mount
 * (its way of dodging hydration mismatches), and a <span> in the SVG namespace
 * is not markup any renderer will draw. The icon simply never appears, server
 * or client. This was measured, not assumed.
 *
 * The data is the same Iconify data either way. All this does is what <Icon>
 * would have done in HTML: a nested <svg> viewport at the icon's own box,
 * scaled to `size` and positioned by x/y in the parent's coordinates. The body
 * is a build-time constant from lib/icons, not anything a user can reach.
 */
function SvgIcon({
  icon,
  x,
  y,
  size,
  className,
}: {
  icon: IconifyIcon;
  x: number;
  y: number;
  size: number;
  className?: string;
}) {
  return (
    <svg
      className={className}
      x={x}
      y={y}
      width={size}
      height={size}
      viewBox={`0 0 ${icon.width} ${icon.height}`}
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: icon.body }}
    />
  );
}

/** The Wagerwolf mark, centred on a point, in the bracket's own coordinates.
 *
 *  Its eyes are HOLES punched by fill-rule evenodd rather than painted shapes,
 *  so at this size they show the card's white through and the head stays a head
 *  rather than collapsing into a blob. That is the whole reason the mark
 *  survives being drawn 34 units tall inside a wreath.
 *
 *  The translate cancels the mark's own origin: its path starts at (20.61, 14),
 *  not at zero, so placing it by its top-left means subtracting that first. */
function Crest({
  cx,
  cy,
  tone = "silver",
}: {
  cx: number;
  cy: number;
  tone?: "silver" | "accent";
}) {
  const s = CREST_H / WOLF_MARK_H;
  return (
    <g
      className={tone === "accent" ? "pb-crest is-accent" : "pb-crest"}
      transform={`translate(${cx - CREST_W / 2 - WOLF_MARK_X * s},${cy - CREST_H / 2 - WOLF_MARK_Y * s}) scale(${s})`}
    >
      <path fillRule="evenodd" d={WOLF_MARK} />
    </g>
  );
}

/* ── PIECES ───────────────────────────────────────────────────────────────── */

function Label({ x, y, text }: { x: number; y: number; text: string }) {
  return (
    <text className="pb-label" x={x} y={y} textAnchor="middle">
      {text}
    </text>
  );
}

/**
 * One slot, in two states.
 *
 * TWO RECTS, NOT ONE. The empty state is a dashed outline and the filled one a
 * solid rule, and `stroke-dasharray` does not interpolate — a single rect
 * swapping between them snaps. Crossfading two rects is the same picture and
 * transitions cleanly.
 *
 * `is-you` is decided here by name equality rather than passed in, so there is
 * exactly one place that can disagree about which team is the visitor's.
 */
function Slot({
  x,
  y,
  w,
  h,
  name,
  shown,
  delay = 0,
  flip = false,
}: {
  x: number;
  y: number;
  w: number;
  h: number;
  name: string;
  shown: boolean;
  /** Seconds to hold before appearing — the card is the LAST thing in its
   *  round, arriving at the end of the line that reached it. Seeds pass 0:
   *  nothing points at them. */
  delay?: number;
  flip?: boolean;
}) {
  const you = name === YOU;
  // The same 9 does both jobs: the card's outer edge and the gap off the
  // helmet. It was 10 while the card was at its widest; the run needed the
  // difference back when the card came in.
  const pad = 9;
  const helmetH = SLOT_HELMET / (HELMET_MARK_W / HELMET_MARK_H);
  const helmetX = flip ? x + w - pad - SLOT_HELMET : x + pad;

  // THE TEXT COLUMN IS THE SPACE LEFT OVER, and the name is centred in it and
  // centre-aligned within itself. Left-anchoring off the helmet was the earlier
  // arrangement and it hung a short line — "YOU", "Rice" — against the helmet
  // with all the slack piled up at the card's outer edge, which made an
  // otherwise identical row of cards look unevenly filled. Centring puts the
  // slack on both sides, so every card reads as the same box whatever is in it.
  //
  // Bounded by the helmet's NEAR edge and the card's outer edge, one `pad` off
  // each. Which of those is left and which is right swaps with `flip`; the
  // midpoint does not care, which is why this is two numbers rather than two
  // branches of layout.
  const colStart = flip ? x + pad : helmetX + SLOT_HELMET + pad;
  const colEnd = flip ? helmetX - pad : x + w - pad;
  const textX = (colStart + colEnd) / 2;

  const hold = delay ? { transitionDelay: `${delay}s` } : undefined;
  const lines = wrapName(name);
  // One line sits on the centre; two straddle it. Each line is its own <text>
  // with an explicit y rather than tspans with `dy`, because dy is cumulative
  // and a third line would silently need different numbers.
  const cy = y + h / 2;
  const LINE_H = 15;

  return (
    <g className={`pb-slot${shown ? " is-on" : ""}${you ? " is-you" : ""}`}>
      {/* On BOTH children: transition-delay is not inherited, and the dashed
          empty state has to leave on the same beat the filled one arrives. */}
      <rect
        className="pb-slot-empty"
        style={hold}
        x={x}
        y={y}
        width={w}
        height={h}
        rx={8}
      />
      <g className="pb-slot-full" style={hold}>
        <rect x={x} y={y} width={w} height={h} rx={8} />
        <Helmet
          x={helmetX}
          y={cy - helmetH / 2}
          w={SLOT_HELMET}
          flip={flip}
        />
        {lines.map((line, i) => (
          <text
            key={i}
            className="pb-name"
            x={textX}
            y={cy + (i - (lines.length - 1) / 2) * LINE_H}
            textAnchor="middle"
            dominantBaseline="central"
          >
            {line}
          </text>
        ))}
      </g>
    </g>
  );
}

/**
 * The champion — a helmet and a name, and NO caption inside it.
 *
 * It used to carry "Champion" in accent micro-type above the helmet, under a
 * round label saying the same word — the one piece of text on the board that
 * told you nothing you were not already looking at. Removing it also lets the
 * box come down to 130 square, which is what keeps it reading as a different
 * kind of object rather than just the widest slot.
 */
function Champion({
  shown,
  delay = 0,
  x = CHAMP_X,
  y = CHAMP_Y,
}: {
  shown: boolean;
  delay?: number;
  /** Defaults to the wide bracket's slot. The narrow layout (see
   *  NarrowBracket) stacks its rounds and puts the champion at the foot of
   *  them, which is the same card in a different place — the only thing it
   *  needs from this component is where to draw it. */
  x?: number;
  y?: number;
}) {
  const hold = delay ? { transitionDelay: `${delay}s` } : undefined;
  // The trophy and the name centre as a PAIR, not individually: the name's
  // ascender height is folded in as `nameH` so the optical centre of the two
  // together lands on the box's centre.
  const nameH = 20;

  // THE ART BLOCK IS THE UNION of the artwork's own box and the crest's, in
  // artwork coordinates. A crest inside the artwork leaves it exactly the
  // artwork's height; one above or below extends it. Written this way so an
  // entry states only where its mark goes and never has to restate what that
  // does to the card — the wreath and the cup use the same three lines.
  const crestY = ACTIVE.crestY ?? 0;
  const crestH = ACTIVE.crestH ?? 0;
  const artTop = Math.min(0, crestY - crestH / 2);
  const artBottom = Math.max(
    ACTIVE.icon.height ?? 16,
    crestY + crestH / 2,
  );
  const artH = (artBottom - artTop) * MARK_UNIT;

  const stackTop = y + (CHAMP - (artH + ACTIVE.gap + nameH)) / 2;
  // The artwork's own top, which is BELOW the block's when the crest is above
  // it. Everything positioned in artwork coordinates hangs off this, not off
  // stackTop.
  const artY = stackTop - artTop * MARK_UNIT;
  return (
    <g className={`pb-champ${shown ? " is-on" : ""}`}>
      <rect
        className="pb-slot-empty"
        style={hold}
        x={x}
        y={y}
        width={CHAMP}
        height={CHAMP}
        rx={12}
      />
      <g className="pb-champ-full" style={hold}>
        <rect x={x} y={y} width={CHAMP} height={CHAMP} rx={12} />
        <SvgIcon
          className="pb-champ-award"
          icon={ACTIVE.icon}
          x={x + (CHAMP - ACTIVE.size) / 2}
          y={artY}
          size={ACTIVE.size}
        />
        {/* In bracket coordinates off the artwork's box rather than nested
            inside SvgIcon — that component takes an IconifyIcon and renders it,
            and threading arbitrary children through it to serve one caller
            would make the generic thing specific. */}
        {ACTIVE.crestH ? (
          <Crest
            cx={x + CHAMP / 2}
            cy={artY + crestY * MARK_UNIT}
            tone={ACTIVE.crestTone}
          />
        ) : null}
        <text
          className="pb-champ-name"
          x={x + CHAMP / 2}
          y={stackTop + artH + ACTIVE.gap + nameH / 2}
          textAnchor="middle"
          dominantBaseline="central"
        >
          {YOU}
        </text>
      </g>
    </g>
  );
}

/** The shared outline, positioned in the bracket's own coordinates. Sized off
 *  width alone; the height follows the artwork's ratio, so it never distorts. */
function Helmet({
  x,
  y,
  w,
  flip = false,
}: {
  x: number;
  y: number;
  w: number;
  flip?: boolean;
}) {
  const s = w / HELMET_MARK_W;
  // Right to left: scale first, then flip about the mark's own centre, then
  // translate — so `x` is the left edge whichever way it faces.
  const t = flip
    ? `translate(${x + w},${y}) scale(${-s},${s})`
    : `translate(${x},${y}) scale(${s})`;
  return (
    <g transform={t}>
      <use href={`#${HELMET_MARK_ID}`} />
    </g>
  );
}

/**
 * The bracket elbow: out of two slots, along a shared vertical, into one.
 *
 * RIGHT ANGLES ONLY. A curve here would be the single most decorative mark on
 * a page built entirely from straight hairlines.
 *
 * `from` is [edgeX, yA, yB] — the edge the two slots leave from and their two
 * centres. `to` is the edge and centre it arrives at. Both halves use this; the
 * right one passes a larger edge x and a smaller join x, and the maths does not
 * care which way it runs.
 */
function Elbow({
  from,
  joinX,
  to,
  shown,
  litY,
}: {
  from: [number, number, number];
  joinX: number;
  to: [number, number];
  shown: boolean;
  /** The y of the winning slot's centre, or null if YOU are not in this
   *  pair. A y rather than a boolean because the winner can be either side —
   *  see litLeg. */
  litY: number | null;
}) {
  const [edge, yA, yB] = from;
  const [toX, toY] = to;
  /** Out of a card at `y`, along to the junction, then to the junction's own
   *  height. Written once so the two grey legs and the lit one cannot differ. */
  const leg = (y: number) => `M${edge},${y} H${joinX} V${toY}`;
  return (
    <>
      {/* ONE LEG PER CARD, each starting at its own slot and ending at the
          junction. Together they draw the same bracket the single stroke did —
          the verticals meet at toY — but each one grows out of the card it
          belongs to instead of one line travelling between two opponents. */}
      <Run d={leg(yA)} shown={shown} lit={false} />
      <Run d={leg(yB)} shown={shown} lit={false} />
      {/* The winner's own leg, drawn OVER the grey one so the accent thread
          runs unbroken from a seed to the centre. */}
      {litY !== null && <Run d={leg(litY)} shown={shown} lit />}
      {/* Then, and only then, out of the junction into the next round. */}
      <Run
        d={`M${joinX},${toY} H${toX}`}
        shown={shown}
        lit={litY !== null}
        delay={JOIN_DELAY}
      />
    </>
  );
}

/**
 * One hairline, drawn on rather than faded in — FROM the start of `d` TO its
 * end, which is why every path in this file is written in the direction the
 * line should grow. See WHERE A LINE COMES FROM above.
 *
 * `pathLength=1` normalises the dash maths so a 32px stub and a 200px leg take
 * the same time; ordering within a round comes from `delay`, not from length.
 */
function Run({
  d,
  shown,
  lit,
  delay = 0,
}: {
  d: string;
  shown: boolean;
  lit: boolean;
  delay?: number;
}) {
  return (
    <path
      className={`pb-run${shown ? " is-on" : ""}${lit ? " is-lit" : ""}`}
      style={delay ? { transitionDelay: `${delay}s` } : undefined}
      d={d}
      pathLength={1}
    />
  );
}

/* ── THE NARROW BRACKET ────────────────────────────────────────────────────
   A phone gets a different diagram, not a smaller one.

   WHY THE WIDE ONE CANNOT SHRINK. It is seven columns by definition — four
   seeds funnelling in from each side — so its width is a fact about the format
   rather than a layout choice. One user unit renders as one pixel only at the
   drawn width of 1220; at 335px every unit is 0.27 of a pixel, which put the
   names at ~3px. Bumping the type was tried twice and is a dead end: the slot
   is a fixed box in the same units, so type large enough to read overflows the
   card it is in. There is no size that is both legible and contained.

   WHAT THIS SHOWS INSTEAD: YOUR RUN. Three rounds stacked top to bottom, each
   one you against the team in front of you, ending on the champion's card. The
   wide bracket's argument is "eight teams, three rounds, one champion, and it
   is you"; this makes the same argument from the inside, and it is arguably
   the better one on a phone — a bracket you read as a participant rather than
   as an observer.

   Nothing here is invented. The three opponents are READ OFF the same tree the
   wide bracket draws, so a change to the seeding moves both: LEFT_SEEDS[1] is
   who you meet in the wildcard round, LEFT_R1[1] the other left-half winner,
   and RIGHT_R2 whoever comes out of the right half. Retyping those names here
   would be the one place the two diagrams could disagree about the same
   season.

   THE CARD IS THE SAME CARD. <Slot> at the wide bracket's SLOT_W × SLOT_H, so
   the helmet, the padding, the name wrap and the accent treatment are shared
   rather than reimplemented — and because the viewBox is 360 rather than 1220,
   that identical 12px name renders at ~11px on a 335px screen instead of 3.
   The geometry is the only thing this file states twice.
   ────────────────────────────────────────────────────────────────────────── */

/** Two cards and the gap between them. 2 × 160 + 40, so the pair spans the box
 *  exactly and the cards land on the diagram's own edges. */
const NW = 2 * SLOT_W + 40;

/** One round's pitch: its label, its two cards, and the air under them. */
const N_BLOCK = 118;
/** Top of a round's cards, below its label. */
const N_CARD_TOP = 24;
/** Where the champion's card starts: below the three rounds, plus its label. */
const N_CHAMP_Y = 3 * N_BLOCK + 20;
const N_HEIGHT = N_CHAMP_Y + CHAMP + 4;

/** Your card on the left, the opponent's on the right — and the opponent's is
 *  flipped, so the two helmets face each other across the gap exactly as they
 *  do across the wide bracket's centre. */
const N_LEFT_X = 0;
const N_RIGHT_X = NW - SLOT_W;
/** The middle of the gap between the two cards, where "vs" sits. */
const N_MID_X = NW / 2;

/** The three rounds, and who you meet in each. Read off the tree above — see
 *  the block comment. */
const N_ROUNDS = [
  { label: "Wildcard", opponent: LEFT_SEEDS[1] },
  { label: "Championship", opponent: LEFT_R1[1] },
  { label: "Wagerbowl", opponent: RIGHT_R2 },
];

function NarrowBracket() {
  return (
    <svg
      className="pb-svg-narrow"
      viewBox={`0 0 ${NW} ${N_HEIGHT}`}
      role="img"
      /* BOTH DIAGRAMS CARRY A DESCRIPTION, and only one is ever announced:
         whichever the media query is not showing is `display: none`, which
         takes it out of the accessibility tree as well as off the screen. It
         was `aria-hidden` here at first, on the worry that two labelled
         graphics would be read twice — which would have left a phone with a
         bracket that has no description at all, since the wide one is the
         hidden element at that width. */
      aria-label="Your playoff run: you win the wildcard round, the championship round and the Wagerbowl, and are crowned champion."
    >
      {N_ROUNDS.map((round, i) => {
        const top = i * N_BLOCK;
        const cardY = top + N_CARD_TOP;
        return (
          <g key={round.label}>
            <Label x={N_MID_X} y={labelY(cardY)} text={round.label} />
            {/* SHOWN UNCONDITIONALLY. There is no scroll pin at this width and
                nothing to scrub, so the diagram is complete from the first
                frame — see the narrow rules in globals.css, which also cut the
                per-stage transitions so it does not draw itself in. */}
            <Slot x={N_LEFT_X} y={cardY} w={SLOT_W} h={SLOT_H} name={YOU} shown />
            <Slot
              x={N_RIGHT_X}
              y={cardY}
              w={SLOT_W}
              h={SLOT_H}
              name={round.opponent}
              shown
              flip
            />
            {/* The one word the wide bracket does not need: there, two cards
                either side of an elbow obviously play each other; here they are
                two cards in a row. */}
            <text
              className="pb-label"
              x={N_MID_X}
              y={cardY + SLOT_H / 2}
              textAnchor="middle"
              dominantBaseline="central"
            >
              vs
            </text>
            {/* NO CONNECTOR BETWEEN ROUNDS. The wide bracket needs its
                elbows: they are what say which pairs feed which slot in a
                seven-column tree that is otherwise just cards on a grid. Here
                the rounds are a stack, and a stack already reads top to
                bottom — so an accent riser down the middle was a line saying
                what the order of the rows had already said, and at this width
                it was the loudest thing in the diagram. The accent is spent on
                your card in each round instead, which is the thing worth
                pointing at. */
            }
          </g>
        );
      })}

      <Label x={N_MID_X} y={labelY(N_CHAMP_Y)} text="Champion" />
      <Champion shown x={(NW - CHAMP) / 2} y={N_CHAMP_Y} />
    </svg>
  );
}
