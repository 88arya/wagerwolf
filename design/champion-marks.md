# Champion mark — candidates

The landing page's playoff bracket ends on one card: the champion. Every other
card on the board carries a helmet silhouette, which says "a team" — the thing
the other fourteen cards already say. This one carries a piece of artwork with
the **Wagerwolf mark** set into it, saying what the card is *for*.

Which artwork is undecided. Candidates are drawn and judged one at a time; this
file is the record so the final comparison is against what was actually built
rather than what anyone remembers.

## How a candidate gets added

1. Drop the `.svg` in `frontend/scripts/icons/`, **recoloured to
   `currentColor`** and with a viewBox starting at `0 0`. The generator refuses
   it otherwise — see the Icons section in `CLAUDE.md`.
2. Name it in `LOCAL` in `frontend/scripts/build-icons.mjs`, then `npm run icons`.
3. Add an entry to `MARKS` in `frontend/components/PlayoffReveal.tsx` and point
   `ACTIVE` at it.
4. Log it below.

Every measurement in a `MARKS` entry is in **the artwork's own coordinates**,
not bracket units — the candidates have wildly different boxes — and the crest's
x is always the artwork's centre, so only `crestY` is stated.

**Once a winner is picked, collapse `MARKS` and `ACTIVE` to a single constant.**
A registry with one entry is scaffolding left standing.

## Candidates

### Idea 1 — laurel wreath · **saved**

`app:award`, from `award.svg`. A silver wreath with the wolf standing in its
opening, "YOU" beneath it.

- **Size** 78 bracket units, wolf 215 artwork units tall centred at y 262.
- **It is a frame, not a medal.** Its two branches are separate subpaths — one
  entirely left of x 201.5, one entirely right of 298.5 in its 500-box — so the
  column between them is open at every height. Measured by flattening the path,
  not read off a design tool.
- **The opening, by height:** ~131 units across at y 60–100 where the branch
  tips nearly touch, ~364 at y 240–300, ~97 at the bottom where the stems cross.
  The wolf spans y 154–369 and is ~175 wide, clearing the narrowest part of that
  span by a wide margin.
- **Colour:** wreath `--text-3` (silver), and so is the wolf — see the note
  under fixed constraints. The source shipped as two golds and was recoloured on
  the way in.

### Idea 4 — forward-facing helmet · **awaiting verdict** *(currently on screen)*

`app:helmet-front`, from `tibbixel-dot-com-30707-svg.svg`. A football helmet
seen head-on, in the accent, "YOU" beneath. **No wolf on it.**

- **Size 86** bracket units, `gap` 8, and no `crestH` at all.
- **The mark is gone, and that is the point.** Both cups and the wreath needed
  the wolf because a trophy is a generic object — it says "someone won" and
  nothing about who. A helmet is not generic here: every card on the board wears
  one, so the champion wearing one says "a team", and the two things making it
  *this* team are already on the card — the accent and the word YOU. A wolf on
  top would be a badge on a badge.
- **It faces you.** Every other helmet on the board faces its opponent: the left
  half looks right, the right half looks left, this one looks out. That is the
  whole distinction. It cannot be `HelmetMark` with the flip left off — that
  artwork is a side profile and has no front.
- **The card is now entirely accent** — border, artwork, name, and the thread
  arriving from the Wagerbowl. Excess anywhere else on this board; here the
  accent means "this is you" in all four places at once.

**What this one forced:** `crestH`/`crestY` are optional, so a candidate can be
artwork alone; and `MARK_UNIT` fits by the **longer** axis rather than the
height, because this is the first non-square artwork (229.6 × 275.4) and
`SvgIcon` draws into a square viewport. Dividing by height alone was right only
while every candidate was square.

### Scrapped along the way

- **Idea 2 — solid cup, wolf crowning it** (`app:cup`, from `Cup.svg`). Size 54,
  wolf 247 artwork units at y **-170**, i.e. above the box. Dropped with the
  trophy direction. Its ink filled its box, so there was nowhere inside to put
  anything and the mark had to go above — which cost the cup its size, since the
  art block became crest + gap + cup inside a fixed 130 card.
- **Idea 3 — the same cup, bigger, wolf on its face.** Size 80 (from 88), wolf
  175 artwork units at y 155 (from 200 at y 130), accent on gold. Moving the
  mark inside the box paid the cup back most of what Idea 2 spent. Dropped with
  the trophy direction. Two things it established that outlived it: **a mark
  sitting *on* something earns a second colour where standing beside it does
  not**, and at 88/200 the composition wanted air more than scale — the usual
  answer when a thing sits inside another thing.
- **Gold `#c9a227`.** Tried on the cup as an alternative to silver. A fourth hue
  with no precedent in the app; it went out with the trophy it was drawn for.

- **Plain helmet.** What every other card wears, so the champion's card said
  "a team" twice. Also a blob at that size.
- **A `lucide:trophy` icon at 48 with the wolf in its cup.** Worked
  geometrically — the bowl is straight-sided from y 2 to 9 in its 24-box — but
  cost the bracket 15 units of height to make room for, on a graphic whose
  subject is the bracket.
- **A pixel-drawn 8-unit cup with the wolf on its bowl.** Superseded by the
  wreath, on the general point that **a frame has somewhere to put something
  where a solid shape only has a surface to stick it to.** Worth remembering
  when judging later candidates.

## The slot's fixed constraints

These hold whatever wins, and a candidate that breaks one is not
interchangeable with the others:

- The card is **130 × 130**, white, with a 1.5px `--accent` border.
- Artwork + gap + "YOU" (20 units) centre as one stack, so a taller artwork
  eats the margins rather than growing the card.
- The artwork's colour belongs to the **slot**, not to a candidate — it is
  currently **gold `#c9a227`**, under test, having been `--text-3` silver
  before. That is a real departure from the design system's three colours and
  is written down as such in `globals.css`; if gold survives, promote it to a
  token and update the Design system section of `CLAUDE.md`.
- The **mark's** colour is the one thing a candidate does own
  (`crestTone: "silver" | "accent"`), because a mark beside a cup and a mark on
  its face do not want the same answer. Silver reads as one object with the
  artwork; accent reads as a mark *on* it.
- The wolf's eyes are **holes** (`fill-rule="evenodd"`), so whatever is behind
  shows through. That is what keeps the head a head below ~40 units, and it is
  the reason the mark can sit on a filled shape at all.
