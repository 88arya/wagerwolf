"use client";

/**
 * The landing page's fourth section: why you would play this instead of the
 * thing you already play.
 *
 * THE PAGE PROVED WHAT IT IS TWICE AND NEVER SAID WHY TO SWITCH. The marquee
 * shows the sportsbook half is real and the bracket shows the fantasy half is;
 * both are demonstrations of the product's own claim about itself. This is the
 * argument against the alternative, and it belongs after them because every
 * line here is a fact the reader has just watched be true.
 *
 * THE SHAPE IS BENCHMARKED, not invented — see design/benchmarks/why-section.png.
 * A centred two-line heading, then a two-column body: an accordion of claims on
 * the left with exactly one open, and a large tinted panel on the right holding
 * a graphic. The reason that shape works here is that three claims stated at
 * once are a list to skim, where one open claim is a thing to read — and the
 * two greyed under it say how much more there is without competing for the
 * eye.
 *
 * THE PANEL HOLDS A WALL OF APP ICONS, five by five, with Wagerwolf in the
 * middle of them. The claim it makes is one of category rather than of feature:
 * these are the things already on your phone, and this is one of them. It is
 * the brand moment before the call to action, and it argues none of the three
 * claims beside it — those are the argument.
 *
 * FOUR THINGS HAVE BEEN TRIED IN HERE, which is worth knowing before a fifth
 * goes in.
 *
 *  1. A drifting wall of the 32 NFL club abbreviations with the lockup dropped
 *     into each row (components/TeamWall) — it argued nothing, said so in its
 *     own header, and ran on a timer unrelated to this section's, so half the
 *     section was animated against the other half. Deleted.
 *  2. Three figures, one per claim, each drawing the mechanic behind it
 *     (components/WhyFigure) — coherent, and too much: a demonstration beside
 *     every claim turned a section that ARGUES into a third section that
 *     demonstrates, after two that already do. Deleted.
 *  3. The mark alone, centred. The quiet version, and too quiet.
 *  4. A device mockup — a monitor showing the lockup. Rejected on looks.
 *
 * The device is worth one more line, because this file spent a paragraph
 * arguing against one on REGISTER (no photography on the page, structure from
 * hairlines rather than shadows) and that turned out not to be what was wrong
 * with it: the artwork answered the register objection cleanly — a flat render,
 * no contact shadow, ground set to the panel's own --surface-2 — and it still
 * did not work. So the register argument is retired rather than vindicated; if
 * a device is ever tried again, it fails on composition, not on lighting.
 *
 * WHAT IS NOT BUILT YET: 24 of the 25 tiles are empty. They want fantasy and
 * sportsbook app icons, none of which are ours to draw, so that artwork has to
 * be supplied rather than invented — and third-party marks on a marketing page
 * are a decision with a legal edge to it, not just a design one.
 *
 * IT CYCLES ITSELF, and the rule under the open claim is the clock: it fills
 * black left to right over DWELL, and when it lands the next claim opens. That
 * is one element doing two jobs — the row separator the design system was
 * always going to draw, and the only progress indicator the section needs.
 *
 * EVERY ROW IS A FIXED HEIGHT, which is a requirement of cycling rather than a
 * preference. One line of claim and exactly two of detail, enforced in CSS
 * rather than trusted to the copy: a detail that wrapped to three would move
 * every row under it and the panel beside it, every six seconds, forever. The
 * copy is written to fit; the clamp is there for when it stops fitting.
 *
 * IT ONLY RUNS ON SCREEN. Without that the section is most of the way through
 * its cycle by the time anyone scrolls to it, and the first claim — the one it
 * is meant to open on — is the one they never see.
 *
 * A CLIENT COMPONENT, and it did not used to be. It was static markup and the
 * file said so: "shipping JS for it would be paying for nothing." Opening one
 * row at a time is state, so that stopped being true. The CSS-only radio
 * accordion was the alternative and was dropped because the panel will have to
 * follow the open row the moment it has content, and that needs JS anyway.
 *
 * EVERY CLAIM IS A MECHANIC, not an adjective:
 *   - injuries       → there is no roster to lose anyone FROM, and a player who
 *                      never takes the field voids the bet and refunds the
 *                      stake (services/settleGame — the never-played void)
 *   - no money       → the whole premise; see CLAUDE.md's first line
 *   - no draft       → there is no roster model at all; every prop on the board
 *                      is bettable by anyone, every week
 * THREE, AND THERE WAS A FOURTH. It never settled: "Your knowledge actually
 * matters" leaned on an adjective rather than a mechanic; "Change your strategy
 * every week" named the weekly reset, which the first claim already owns;
 * "Nobody can outspend you" was true and well-argued — a sportsbook rewards the
 * larger bankroll, fantasy rewards the draft slot, and here weeklyAllowance is
 * one number handed to every member alike — and still came out.
 *
 * What the three that remain have in common is the answer to why. Each names a
 * COST YOU NO LONGER PAY: a season lost to an injury, real money, an evening
 * spent drafting. That is one argument made three ways, and a fourth claim in a
 * different register — a thing you gain rather than a thing you avoid — read as
 * a list that had run out of its own idea. Three is the shape.
 *
 * So: a fourth belongs here only if it is another cost removed. Anything else
 * is a different section.
 * Nothing here is a promise the backend does not already keep. Adding a fifth
 * means finding a fifth mechanic, not a fifth adjective.
 */

import { useEffect, useRef, useState } from "react";
import Logo from "@/components/Logo";

/**
 * The wall in the panel: nine tiles, the middle one ours.
 *
 * 3x3 BECAUSE IT HAS A MIDDLE, and because eight is how many neighbours there
 * actually are. It was 5x5 first, which needed 24 and left 16 of them empty —
 * a grid sized to an idea rather than to the artwork. An odd grid is the
 * requirement either way: an even one has no centre tile, so the brand would
 * have to sit off-centre or straddle four, and the whole composition is that
 * Wagerwolf is one of these, in the middle of them. CENTER is derived from
 * TILES rather than written as 4, so a return to 5x5 needs one number changed.
 *
 * FOUR FANTASY, FOUR BOOKS, AND THE ARRANGEMENT IS DELIBERATE: fantasy apps on
 * the four corners, sportsbooks on the four edges. Both categories therefore
 * touch the centre tile on every side, which is the claim the section's
 * heading makes in words — "play like a sportsbook, compete like fantasy". A
 * fantasy row over a book row would have said something else: two camps with
 * us between them.
 *
 * THE ARTWORK IS THEIRS, NOT OURS. Every mark here belongs to the company it
 * names, and none of it is licensed to this project — it is on the page as
 * nominative reference, the same way a comparison page names competitors.
 * Worth a look from someone who does this for a living before the site is
 * public; see also the "not legally reviewed" note on the /docs pages.
 */
const WALL = 3;
const TILES = WALL * WALL;
const CENTER = (TILES - 1) / 2;

/**
 * The eight, in reading order around the centre — corners fantasy, edges books.
 *
 * `ar` is the artwork's INK aspect ratio, width over height, measured off the
 * file rather than typed. Every PNG in public/wall has been cropped to its ink,
 * so the file's own box IS the ink box and these numbers are just w/h of the
 * cropped image. FanDuel is the exception: it ships as an SVG with a full-bleed
 * background rect, so its ink already fills its viewBox (2500x2492).
 *
 * WHY THE CROP HAPPENED. The files arrived with wildly different internal
 * padding — Sleeper's lockup occupied 19.4% of its 500x500 canvas, FanDuel's
 * 100% — and `object-fit: contain` fits the FILE's box, not the ink in it. So
 * two logos at the same nominal size rendered four times different. Cropping
 * makes the two boxes the same thing; re-crop if a file is ever replaced.
 *
 * `name` is not rendered: the wall is aria-hidden, so these are here to keep
 * the list legible and to say which file is which without opening it. Do not
 * turn them into alt text; a screen reader reciting eight competitors' names is
 * noise, and the tile carries no information a user needs.
 */
const LOGOS = [
  { src: "/wall/espn-fantasy.png", name: "ESPN Fantasy", ar: 1.0563, ink: 1 },
  { src: "/wall/draftkings.png", name: "DraftKings", ar: 0.964, ink: 1 },
  { src: "/wall/sleeper.png", name: "Sleeper", ar: 0.8224, ink: 1 },
  { src: "/wall/fanduel.svg", name: "FanDuel", ar: 1.0033, ink: 0.5017 },
  /* centre: Wagerwolf */
  { src: "/wall/fanatics.png", name: "Fanatics", ar: 1.182, ink: 1 },
  { src: "/wall/nfl-fantasy.png", name: "NFL Fantasy", ar: 0.75, ink: 1 },
  { src: "/wall/betmgm.png", name: "BetMGM", ar: 0.748, ink: 1 },
  { src: "/wall/underdog.png", name: "Underdog", ar: 1.002, ink: 1 },
];

/**
 * How big a logo is drawn in its tile: EVERY MARK GETS THE SAME INK HEIGHT.
 *
 * THE `ink` FIELD IS THE WHOLE POINT, and getting here took three wrong turns
 * worth recording so nobody repeats them.
 *
 *  1. Equal AREA. Right for a set of mixed wordmarks and shields, wrong here:
 *     these are all icon-shaped (ratios 0.75 to 1.18) and over that narrow a
 *     range equal area just makes the tall ones taller.
 *  2. Equal BOX height. Every file scaled so its own edges matched FanDuel's.
 *     That is only equal MARK height if every file is cropped to its mark, and
 *     one was not — see below.
 *  3. Assuming FanDuel was. Its SVG is a white square with the shield inset in
 *     it, and its ink is 50.17% of its box, so its shield was rendering at
 *     36.07% of the tile while every cropped PNG rendered at 71.89% — the
 *     others were literally twice the size, which is what was being looked at
 *     and called wrong twice.
 *
 * So `ink` is each asset's ink height as a fraction of its own box, measured
 * off the file. Box height is then MARK_H / ink, which lands every mark on the
 * same height whatever padding its file carries. Every PNG is cropped to its
 * ink and so is 1; FanDuel is 0.5017 and is the only one that is not.
 *
 * MARK_H IS FANDUEL'S SHIELD, because FanDuel is the one that was looked at and
 * approved. 0.7189 (its box) x 0.5017 (its ink) = 0.3607. Feeding FanDuel's own
 * numbers back through the formula returns 0.7189 exactly, so the reference is
 * untouched BY CONSTRUCTION rather than by being special-cased.
 *
 * IF AN ASSET IS REPLACED, re-measure both `ar` and `ink` — a file with a
 * different internal margin will otherwise render at a different size while
 * looking, in the list above, like it was declared the same.
 *
 * MAX_W is a guard, not a policy. Nothing here reaches it — the widest is
 * FanDuel's own box at 72% — but a wordmark-shaped logo (the old bet365 was
 * 4.66:1) would want far more than the tile, and overflowing is worse than
 * being short.
 */
const MARK_H = 0.3607;
const MAX_W = 0.92;

function tileSize(ar: number, ink: number) {
  let h = MARK_H / ink;
  let w = h * ar;
  if (w > MAX_W) {
    w = MAX_W;
    h = w / ar;
  }
  return { width: `${(w * 100).toFixed(2)}%`, height: `${(h * 100).toFixed(2)}%` };
}

/** The wolf's own ink ratio, from Logo's MARK_VIEWBOX (58.62 / 72.1).
 *
 *  Its `ink` is 1 and that is exact rather than assumed: MARK_VIEWBOX is the
 *  path's measured bounding box — Logo's own header records it being computed
 *  by flattening the curves rather than read off a design tool — so the bare
 *  mark has no padding at all. It goes through the same formula as the eight
 *  around it, so our mark is sized by the rule rather than exempt from it. */
const MARK_AR = 58.62 / 72.1;

/** How long a claim stays open, in ms. ONE SOURCE OF TRUTH: the same number
 *  drives the timer that advances the list and the animation that fills the
 *  rule, handed to CSS as an inline animation-duration. Split them and the bar
 *  finishes early or late, which reads as a bug rather than as a pace.
 *
 *  7500, up a quarter from 6000. Two lines of detail is about four seconds of
 *  reading and the rest is the beat before it moves — under that the section
 *  felt like it was hurrying the reader off each claim. */
const DWELL = 7500;

const CLAIMS = [
  {
    claim: "Injuries can't ruin your season.",
    detail:
      "One injured star doesn't destroy months of work. Every week you build a new lineup from scratch.",
  },
  {
    claim: "No money at risk.",
    detail:
      "Use your virtual bankroll to compete without putting real money on the line. We never ask for a deposit.",
  },
  {
    claim: "No draft required.",
    detail:
      "Skip the hours of drafting, waiver wires, and roster management. Pick your bets and play.",
  },
];

export default function WhyWagerwolf() {
  // The first claim, open on arrival. There is no "all closed" state: a column
  // of grey lines with no body reads as something that failed to load.
  const [open, setOpen] = useState(0);
  const [running, setRunning] = useState(false);
  const listRef = useRef<HTMLUListElement>(null);

  // WHETHER TO RUN AT ALL. Reduced motion never starts it — a panel that
  // rewrites itself on a timer is the plainest case that setting exists for —
  // and otherwise it runs only while the list is actually on screen.
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const io = new IntersectionObserver(
      ([entry]) => setRunning(entry.isIntersecting),
      // Nearly half of it visible, not a sliver: the point is to start when
      // someone has arrived at the section, not when its top edge clips in.
      { threshold: 0.45 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // Keyed on `open` as well as `running`, so a click restarts the dwell rather
  // than inheriting whatever was left of the previous claim's.
  useEffect(() => {
    if (!running) return;
    const id = setTimeout(
      () => setOpen((i) => (i + 1) % CLAIMS.length),
      DWELL,
    );
    return () => clearTimeout(id);
  }, [running, open]);

  return (
    <section className="lp-section is-why">
      <div className="why-head">
        {/* TWO BEATS NOW, and the grey second line is back — which reverses
            what this comment used to argue, so the reasoning is worth keeping.

            It read "Play like a sportsbook, compete like fantasy." and took a
            single line on the grounds that it said ONE thing in two halves:
            greying the second half would have made the half the section turns
            on look like an afterthought. The copy changed shape. "Fantasy
            Football. Sportsbook." names the two things and "The best of both
            worlds." is the claim about them — a thing stated and then
            qualified, which is exactly the pattern .lp-sec-title-2 exists for
            and what the marquee and the bracket headings both do. So this now
            matches them instead of being the exception.

            NO NON-BREAKING SPACES ANY MORE. The old line needed them to force
            its break after the comma; the break here is a real element, so
            there is nothing to bind. A <span> rather than a <br> for the same
            reason PropMarquee uses one: it IS the heading's second beat, not a
            separator inside it, and a <br> would be a paragraph boundary that
            stops the whole thing selecting as one heading.

            Full stops on both, as everywhere else on this page. */}
        <h2 className="lp-sec-title">
          Fantasy Football. Sportsbook.
          <span className="lp-sec-title-2">The best of both worlds.</span>
        </h2>
      </div>

      <div className="why-grid">
        {/* A LIST, and semantically so — three unordered reasons. Not <ol>:
            these are not steps and not ranked for the reader, and numbering
            them would borrow the one signal /docs/how-to-play uses for
            something that genuinely is a sequence. */}
        <ul className="why-list" ref={listRef}>
          {CLAIMS.map(({ claim, detail }, i) => {
            const isOpen = i === open;
            return (
              <li className={`why-row${isOpen ? " is-open" : ""}`} key={claim}>
                {/* The heading IS the control, rather than a heading with a
                    control beside it — the whole row is the target, and a
                    <button> inside the <h3> keeps both the outline semantics
                    and the keyboard behaviour without inventing either. */}
                <h3 className="why-claim-h">
                  <button
                    type="button"
                    className="why-claim"
                    onClick={() => setOpen(i)}
                    aria-expanded={isOpen}
                  >
                    {claim}
                  </button>
                </h3>
                {isOpen ? <p className="why-detail">{detail}</p> : null}
                {/* THE ROW'S OWN SEPARATOR, FILLING. Rendered only on the open
                    row and only while the cycle is live, so it mounts fresh on
                    every advance — which is what restarts the animation, with
                    no key and no imperative reset. It sits ON the border rather
                    than above it (bottom: -1px), so the grey rule turns black
                    rather than gaining a second line under it. */}
                {isOpen && running ? (
                  <span
                    className="why-progress"
                    style={{ animationDuration: `${DWELL}ms` }}
                  />
                ) : null}
              </li>
            );
          })}
        </ul>

        {/* `aria-hidden` on the wall: it is a composition, and the one piece
            of information in it — that this is Wagerwolf — is already the
            heading, the nav and the footer. */}
        <div className="why-figure">
          {/* --wall-n rather than a hardcoded 3 in the stylesheet: the grid's
              column count and TILES have to agree, and this is the only way to
              say so once. */}
          <div
            className="why-wall"
            aria-hidden="true"
            style={{ ["--wall-n" as string]: WALL }}
          >
            {Array.from({ length: TILES }, (_, i) => (
              <span
                key={i}
                className={`why-tile${i === CENTER ? " is-brand" : ""}`}
                style={
                  i === CENTER
                    ? { ["--brand-h" as string]: tileSize(MARK_AR, 1).height }
                    : undefined
                }
              >
                {/* `bare` draws the head alone in currentColor, which is what
                    lets .why-tile.is-brand colour it — the tiled variant paints
                    its own hard-edged accent square, wrong twice over here: it
                    has no corner radius to match the tile, and the tile is
                    white on purpose. See the .why-tile.is-brand rule. */}
                {i === CENTER ? (
                  <Logo bare size={64} />
                ) : (
                  /* The index shifts by one past the centre, because LOGOS has
                     eight entries and the grid has nine cells. */
                  (() => {
                    const l = LOGOS[i < CENTER ? i : i - 1];
                    return (
                      /* A SPAN WITH A BACKGROUND, NOT AN <img>, and that is
                         about the eight marks rather than about layout.

                         None of these is licensed to this project. As plain
                         <img> elements the wall was a convenient
                         redistribution point for somebody else's trademark:
                         right-click "Save image as", drag-to-desktop and "Copy
                         image" all worked and all yielded a clean logo file.
                         A background-image is not an element the context menu
                         can target and is not a drag source, so all three
                         paths close at once, with no overlay div and no
                         page-wide oncontextmenu handler — the two obvious
                         fixes, both of which are defeated in one devtools
                         click while being hostile to ordinary readers.

                         THIS IS RISK REDUCTION AND NOT PROTECTION, and the
                         distinction should stay honest here: anything the
                         browser renders can still be taken from devtools, from
                         the network tab, or by requesting /wall/*.png
                         directly. The goal is only to close the casual path.

                         Sizing is unchanged: tileSize() still returns the
                         width and height percentages, and background-size:
                         contain in globals.css does what object-fit: contain
                         did. */
                      <span
                        className="why-mark"
                        style={{
                          ...tileSize(l.ar, l.ink),
                          backgroundImage: `url("${l.src}")`,
                        }}
                      />
                    );
                  })()
                )}
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
