# Landing section — "Head to head, then the bracket"

A Figma brief for the third section of the Wagerwolf landing page. It replaces
the two `is-h2h` sections that were removed (a static season timeline and a
scroll-driven variant of it) — both are gone from the code, so this is a fresh
design with nothing to match.

The section argues the **fantasy** half of the headline ("The world's first
fantasy football sportsbook."), the way the marquee above it argues the
sportsbook half. Two parts, stacked:

1. **Top — one week.** A single head-to-head matchup: two helmets facing each
   other, and under each one that player's lineup of bets.
2. **Bottom — the whole season.** A playoff bracket that starts with 8 teams
   split to the far left and far right and collapses inward to one champion.

---

## 0. Canvas and design system

Design at **1440 × auto**, content constrained to a **1220px** centred column
(the app's content rail; the gutter is `max(20px, (100% - 1220px) / 2)`).

**Colour — three, plus team colours.**

| Token | Value | Use |
|---|---|---|
| `--bg` / `--surface` | `#FFFFFF` | page and card ground, both pure white |
| `--text` | `#000000` | primary text, pure black |
| `--text-2` | `#475569` | secondary text |
| `--text-3` | `#94A3B8` | micro-labels, subtitles |
| `--text-4` | `#CBD5E1` | dimmest text, eliminated states |
| `--surface-2` | `#F0F2F5` | filled chips, inactive fills |
| `--surface-3` | `#E8ECF0` | avatar / crest tiles |
| `--border` | `#E2E8F0` | the standard 1px hairline |
| `--border-2` | `#CBD5E1` | heavier hairline, dashed rules |
| `--accent` | `#2B5DE3` | the single accent |
| `--accent-dim` | `rgba(43,93,227,0.10)` | accent fill behind accent text |
| `--win` | `#16A34A` | won leg / advancing team |
| `--loss` | `#DC2626` | lost leg |
| `--pending` | `#D97706` | open leg |

Status colours are **functional only** — never decoration, never a large fill.

**Structure comes from 1px hairlines and whitespace. No shadows anywhere in
this section, and no nested boxes.** A card is a 1px `--border` rectangle on
white. Radius **12px** for cards, **8px** for anything inside one.

**Type — Inter Tight, weights 400–600 only.** Never 700+ in this section.
Tight tracking on large text (`-0.028em`), line-height 1.0–1.05. Numerals are
tabular. Micro-labels: 10px, uppercase, `0.12em` tracking, weight 500,
`--text-3`.

---

## 1. Section header

Centred, max width 940px, 44px of space under it.

- **Title** — 48px / weight 500 / `-0.028em` / `#000000` / sentence case.
  One line, ~37 characters maximum.
  Copy: **"One opponent a week. One champion."**
- **Subtitle** — same size and weight, `--text-3` `#94A3B8`, on its own line.
  Copy: **"Beat them by ending the week with more money."**

Section padding: **104px top, 112px bottom**, so it steps down from the
marquee above and into the closing band below.

---

## 2. Top half — the matchup

### Layout

A **three-part row**, full 1220px:

```
┌──────────────────────┐   ┌─────┐   ┌──────────────────────┐
│   PLAYER CARD (L)    │   │ VS  │   │   PLAYER CARD (R)    │
│      560 x 340       │   │ 60  │   │      560 x 340       │
└──────────────────────┘   └─────┘   └──────────────────────┘
```

- Two **equal** cards, 560px wide, side by side, 40px apart.
- Between them a narrow centre column holding the week label and the joint.
  It is **not a card** — no border, no fill, it floats on the white.
- The two cards are **mirrored, not identical**: the left card's helmet faces
  right, the right card's helmet faces left. They look at each other. That
  mirroring is the whole reason the pair reads as a matchup rather than as two
  unrelated cards, so it is the one thing that must survive any resize.
- On the mirror: **only the helmet flips.** Text, numbers and bet rows stay
  left-aligned on both sides — mirrored text is unreadable and mirrored numbers
  look like a rendering bug.

### The centre column (60px wide, vertically centred)

Stacked, centred:

1. Micro-label **"WEEK 7"** — 10px, uppercase, `0.12em`, `--text-3`.
2. **"VS"** — 20px, weight 500, `--text-4` `#CBD5E1`. Deliberately faint: it is
   a joint, not a headline.
3. A **1px vertical hairline**, `--border`, ~120px tall, under the VS — the only
   rule separating the two sides.

### The player card (560 x 340, 1px `--border`, radius 12, white, 24px padding)

**Card header** — a row, 56px tall, with a 1px `--border` bottom hairline and
16px of space under it:

- **Helmet**, 64 x 64. A flat silhouette filled with that player's helmet colour
  (per-league identity — every member has a unique hex within a league). Left
  card: a deep blue. Right card: a warm red. Facing inward.
- Beside it, stacked, 12px gap from the helmet:
  - **Team name** — 18px, weight 500, `#000000`. e.g. *Ravenous Dogs*.
  - **Record + tag** — 12px, `--text-2`. e.g. *4–2 · RAV*.
- Right-aligned in the header, on the outer edge of each card:
  - Micro-label **"WEEK TOTAL"** — 10px, uppercase, `--text-3`.
  - **$1,240** — 28px, weight 500, tabular, `#000000`.
  - The winning side's figure is **`--accent` `#2B5DE3`** instead of black. One
    accent, on the thing that is winning.

**Lineup** — the body of the card, a stack of **four bet rows** separated by 1px
`--border` hairlines (rules between rows, no box around the group). Two kinds of
row:

**(a) Single** — 44px tall, one line:

```
  ○  Lamar Jackson · Passing yards      OVER 232.5     $100 → $190     ●
```

- Small 24 x 24 rounded-square avatar tile, `--surface-3` fill, radius 6.
- **Player name** 13px weight 500 `#000000`; **market** 13px `--text-2`,
  separated by a `·`.
- **Side and line** — "OVER 232.5" — 13px weight 600, `#000000`.
- **Stake → return** — 13px tabular. Stake `--text-2`, the arrow `--text-4`, the
  return `--accent`. Odds and returns are always the accent; that is the one
  thing this design system spends its accent on.
- **Status dot**, 8px, on the far edge: `--win` green, `--loss` red, or
  `--pending` amber.

**(b) Parlay** — taller, 76px, and visibly one ticket rather than three rows:

```
  ⛓  3-LEG PARLAY                        +540         $50 → $320      ●
  │   Josh Allen · 2+ passing TDs
  │   Bills ML
  │   Zay Flowers · Over 4.5 receptions
```

- The header line matches a single's rhythm: a **"3-LEG PARLAY"** micro-label
  (10px, uppercase, `0.12em`, `--text-3`) where the player name sits, then the
  compound odds in `--accent`, then stake → return, then the status dot.
- The legs hang under it as three 11px `--text-2` lines, indented 34px, tied
  together by a **1px vertical `--border` rule** down the left of the group.
  That rule is what makes it read as one ticket. **No box, no fill, no tint** —
  a filled parlay block turns the card into a stack of nested boxes, which is
  the exact idiom this design system exists to avoid.
- A leg that has already won gets `--win` text; a dead leg `--loss` with a
  strikethrough. The rest stay `--text-2`.

**Mix per card:** left card = 3 singles + 1 parlay; right card = 2 singles +
2 parlays. Different shapes on the two sides, so the pair does not read as one
template rendered twice.

**Content is illustrative but must be plausible.** Real NFL names, real market
names from the 22 stat types this product prices (passing yards, rushing yards,
receptions, receiving TDs, sacks, kicking points, field goals made…), realistic
American odds. Never invent a market the app does not offer.

---

## 3. Bottom half — the playoff bracket

> **Built, and it diverged from this brief.** `frontend/components/PlayoffReveal.tsx`
> is the authority now. Three deliberate departures: slots carry **fantasy team
> names** rather than seed numbers (a joke name is not a claim about anything,
> and it says what the league feels like); every helmet is **black except the
> visitor's, which is the accent** — one exception reads, twelve team colours
> read as none; and the graphic is **1400 wide, not 1220**, because a name has
> an absolute pixel budget and the rail's 610px half cannot give three columns
> plus a champion enough of one. The rest below still holds.


Separated from the matchup above by **72px** of space and a **1px dashed
`--border-2` rule** across the full 1220px. The rule marks the change of scale:
above it is one week, below it is the whole season.

### Structure

**8 teams. 4 far left, 4 far right. Every round moves inward. One champion in
the middle.** Seven columns across 1220px:

```
  SEEDS       WILDCARD    CHAMPIONSHIP   WAGERBOWL   CHAMPIONSHIP   WILDCARD      SEEDS
  (4 left)    (2 left)      (1 left)      (winner)     (1 right)    (2 right)   (4 right)

   ┌──┐                                                                          ┌──┐
   │1 │──┐                                                                    ┌──│2 │
   └──┘  │  ┌──┐                                                        ┌──┐  │  └──┘
   ┌──┐  ├──│  │──┐                                                  ┌──│  │──┤  ┌──┐
   │8 │──┘  └──┘  │  ┌──┐                            ┌──┐            │  └──┘  └──│7 │
   └──┘           ├──│  │──┐    ╔═════════════╗   ┌──│  │──┐         │           └──┘
   ┌──┐           │  └──┘  └────║  WAGERBOWL  ║───┘  └──┘  │         │           ┌──┐
   │4 │──┐        │             ╚═════════════╝            │         │        ┌──│3 │
   └──┘  │  ┌──┐  │                                        │  ┌──┐   │        │  └──┘
   ┌──┐  ├──│  │──┘                                        └──│  │───┤        │  ┌──┐
   │5 │──┘  └──┘                                              └──┘   └────────┴──│6 │
   └──┘                                                                          └──┘
```

Round sizes, stated plainly: **8 → 4 → 2 → 1.** Eight seeds play the Wildcard
round; four survivors play the Championship round; two survivors play the
Wagerbowl; one champion.

Column widths, left to right: **200 / 160 / 160 / 180 / 160 / 160 / 200**, with
the connector runs living in the gaps between them.

### Round labels

Above each column, centred over it: 10px, uppercase, `0.12em` tracking, weight
500, `--text-3`.

- Outer columns: **"WILDCARD"** (the round the 8 seeds play)
- Middle columns: **"CHAMPIONSHIP"**
- Centre: **"WAGERBOWL"** — this one is 12px and `#000000`, not a micro-label.
  It is the name of the thing the whole bracket points at.

Labels mirror across the centre: the left and right halves carry the same three
names, reading inward from both edges.

### The team slot

Two sizes, both 1px `--border` on white:

- **Seed slot** (round 1, 8 of them): 200 x 52, radius 8.
  - **Seed number** — 11px, weight 500, `--text-3`, in a 20px column on the
    outer edge.
  - **Helmet**, 28 x 28, in that team's colour. Left-side helmets face right,
    right-side face left — the same inward-facing rule as the matchup above.
  - **Team name** — 13px, weight 500, `#000000`, truncating with an ellipsis.
  - **Record** — 11px, `--text-2`, under the name.
- **Advanced slot** (rounds 2 and 3): 160 x 44, radius 8. Helmet 24px, name
  13px, no record, no seed number. Smaller as it moves inward, so the bracket
  narrows visually as well as numerically.

**States:**

- **Advancing** — 1px `--accent` border, name `#000000`, and a 3px `--accent`
  bar on the inward-facing edge (the edge the connector leaves from).
- **Eliminated** — border stays `--border`, helmet drops to 35% opacity, name
  goes `--text-4`. No strikethrough and no red: losing a playoff round is not an
  error state.
- **Undecided** — a slot drawn in **1px dashed `--border-2`** with no contents.
  This is what makes the bracket honest about a season still in progress.

### Connectors

1px `--border` orthogonal elbows — out from the inward edge of a slot, along,
then into the next round. **Right angles only, no curves.** The two lines
feeding one slot meet as a single bracket.

The path the champion took is drawn in **`--accent` at 1px** the whole way from
its seed to the centre — one continuous blue thread through an otherwise grey
diagram. That thread is the design's payoff: it is the only thing on the page
that shows a whole season as one connected shape.

### The centre — the Wagerbowl

A **180 x 180** square, radius 12, 1px `--accent` border, `--accent-dim`
`rgba(43,93,227,0.10)` fill. The only filled element in the bracket.

Stacked and centred inside:

1. Micro-label **"WAGERBOWL CHAMPION"** — 10px, uppercase, `--accent`.
2. **Helmet**, 56 x 56, facing forward — not mirrored. The champion faces
   nobody.
3. **Team name** — 15px, weight 600, `#000000`.
4. **Final margin** — 12px, tabular, `--text-2`. e.g. *$2,480 – $1,910*.

Draw a second variant of this square, **undecided**: dashed `--border-2`, no
fill, a `--text-4` helmet outline, and "TBD" in place of the name. That is the
state a live season is in for 16 of its 17 weeks, so it is the state the
component will spend most of its life in.

---

## 4. Responsive

- **≥ 1220px** — as drawn.
- **900–1219px** — the two player cards shrink together, always side by side.
  The bracket keeps all seven columns; slots narrow to 150 / 130.
- **< 900px** — the matchup cards **stack vertically**, and when they do the
  helmets rotate to face *down* and *up* respectively, so they still face each
  other. Two helmets side by side facing away is not a matchup at any width.
  The bracket becomes a single left-to-right ladder (8 → 4 → 2 → 1, all seeds on
  the left) rather than a mirrored one — an inward-collapsing bracket cannot
  survive a narrow column, and a lopsided ladder at least stays readable.

---

## 5. Do not

- No shadows. Not on the cards, not on the bracket slots, not on the centre
  square.
- No gradients, no glows, no drop shadows on the helmets.
- No box around a group of rows — a 1px rule between them is the separator.
- No weight above 600 anywhere.
- No second accent colour. Team helmet colours are the only other hues, and they
  appear only on helmets.
- No fabricated figures presented as live data. This graphic is explicitly
  illustrative; everything else on this landing page shows real markets.
