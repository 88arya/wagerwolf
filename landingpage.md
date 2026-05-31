# Landing Page Vision

---

## Top Section — Hero

Two-column layout. Text left, device mockups right.

### Left column — hero text + CTA
- Eyebrow label: `NFL 2026 Season`
- Big headline: `Bet NFL props. Beat your friends.`
- Subtext: `Fantasy football format, NFL sportsbook scoring. Pick props and game lines each week, go head-to-head against one opponent, and win the season.`
- Get Started card below the copy (Join Public / Join with Code / Create a League)
- Small disclaimer: `All money is fake · For entertainment only`

### Right column — device mockups
Browser/phone frame mockups showing real screens from the app. Slightly overlapping or stacked at angles to feel dynamic.

Screens to show:
1. **Bet page** — prop cards with over/under buttons, parlay slip open on the side
2. **Matchup view** — head-to-head weekly matchup card with both players' helmets and scores
3. **Leaderboard** — standings table with helmet avatars, W-L records, balances

Stack them at slight rotations or cascade them (front screen largest, back screens peeking behind). Use a browser chrome frame (address bar, window controls) to make them look like real desktop screens. Alternatively a phone frame for a more modern feel.

---

## Bottom Section — How to Play

Full-width section on a light grey background (`--surface-2`).

Section header:
- Blue eyebrow: `How to Play`
- Bold title: `Fantasy football format, NFL sportsbook scoring.`

Six steps in a 3×2 grid of white cards. Each card:
- Blue step number (`01` – `06`)
- Bold title
- Short grey description

Steps:
1. **Join a League** — Create a private league and invite friends, or drop into a public one.
2. **Get Your Weekly Budget** — Balance resets each week to the league allowance. That's your bankroll.
3. **Bet Props & Game Lines** — Player props (yards, TDs, receptions) or game lines (spread, total, moneyline).
4. **Parlay for Bigger Payouts** — Stack bets into a parlay. All legs must hit, but odds multiply.
5. **Head-to-Head Matchup** — Paired against one opponent each week. Whoever profits more wins.
6. **Playoffs & Champion** — Top records advance. Win the bracket, win the league.

---

## Implementation Notes

- Device mockup library options: **Devices.css**, **Responsively**, or custom SVG browser chrome drawn in code
- Screenshots of the app can be static images (PNG/WebP) dropped inside the frame SVG/div
- Mockups should be real screenshots, not placeholder lorem ipsum screens
- For the stacked/angled look: CSS `transform: rotate(-3deg)` on back cards, `rotate(2deg)` on middle, flat on front; use `z-index` to layer
- The mockup column should be roughly 500–560px wide; hero text column takes remaining space
- On narrow viewports the mockup column collapses below the text (flexWrap)
