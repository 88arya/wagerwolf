# SharpAPI — NFL Probe (live test, 2026-07-18)

12-request budget spent directly against `sport=football&league=nfl` to see what's actually available before the season starts. Companion to `sharpapi.md` (the MLB pull, which proved out the full pipeline including player props).

**Bottom line: NFL game lines (moneyline/spread/total) are already posted for the regular season and some preseason games, months out. Player props are not posted anywhere yet — not even for the closest preseason games (Aug 6). Zero `is_player_prop` rows returned across the entire NFL pull.**

---

## The 12 requests

| # | Call | Result |
|---|---|---|
| 1 | `GET /sports` | `football`: 1,594 events, 5 live (unrelated leagues e.g. arena football) |
| 2 | `GET /markets?sport=football` | Confirms NFL prop market keys exist in the catalog (schema is ready, just no data yet) |
| 3 | `GET /teams?sport=football&league=nfl` | Full 32-team list with abbreviations, matches our DB (BUF, DET, NO, PHI, ARI, ATL, CHI, DAL, DEN, GB…) |
| 4 | `GET /events?sport=football&league=nfl` (page 1, offset 0) | 50 of 808 total events. Mostly MVP/rookie-of-the-year/conference-winner futures, one real game (HOF Game, book: kalshi — not our tier) |
| 5 | `GET /odds?sport=football&league=nfl&sportsbook=draftkings,fanduel&limit=200` (page 1) | 200 rows, almost all "NFL Specials" MVP/ROY futures |
| 6 | same, cursor page 2 | 200 rows — real regular-season games start appearing (moneyline/spread/total, FanDuel only) |
| 7 | same, cursor page 3 | 88 rows, `has_more: false` — end of feed |
| 8 | `GET /odds?sport=football&league=nfl&sportsbook=draftkings&limit=200` | **0 rows.** DraftKings has posted nothing for NFL yet |
| 9 | `GET /events/nfl_patriots_seahawks_2026-09-09_b3/markets` | Per-event market breakdown by book (see below) |
| 10 | `GET /events?sport=football&league=nfl&offset=50` (page 2) | 17 more real matchups: Aug preseason games, mostly `books: ['kalshi']` |
| 11 | `GET /account/usage` | `rate_limit: {limit: 12, remaining: 8}` at that point — confirms the 12/min cap live |
| 12 | `GET /events/nfl_cardinals_panthers_2026-08-06_b3/markets` | Preseason game markets — confirms neither DK nor FD posted for this one |

---

## What's actually live right now

### League keys under `football`
```
nfl, college_football, ncaaf, cfl, ncaaf_conferences, nfl_super_bowl_lxi,
nfl_season_player_props, usa_-_nfl_futures, usa_-_nfl_preseason, ...
```
Note `nfl_season_player_props` exists as its own league key — worth polling separately once props go live, in case they land there before showing up in the main `nfl` feed.

### Events (808 total under `league=nfl`)
Three flavors mixed together in `/events`:
1. **Real games** — `home_team`/`away_team` both populated. Full regular season schedule is already in the system (games through `2026-12-25`).
2. **Futures/pseudo-events** — `home_team: "NFL Specials"` or a player's name, `away_team: ""`. Markets: `mvp`, `rookie_of_the_year`, `conference_winner`, `most_points_player`.
3. Each real game can appear as multiple event IDs (`_b0`, `_b2`, `_b3` suffixes) depending on which book fed it first — same pattern as MLB.

### Odds pull aggregate (488 rows, DK+FD filter, 3 pages)
```
rookie_of_the_year   197
mvp                    99
moneyline              64
point_spread           64
total_points           64
```
- **All 488 rows came from FanDuel.** DraftKings returned zero rows on a dedicated DK-only query (request #8).
- 192 rows belonged to 32 real games — exactly 6 rows/game (ML home/away, spread home/away, total over/under). No alt lines, no player props.
- Earliest real game with lines: `nfl_patriots_seahawks_2026-09-09_b3` (season opener). Sample:
  ```
  moneyline    New England Patriots   +166
  moneyline    Seattle Seahawks       -198
  point_spread Seattle Seahawks       -4.5  (-102)
  point_spread New England Patriots   +4.5  (-120)
  total_points Over 44.5              (-115)
  ```

### Per-event `/markets` endpoint reveals more than the tier-filtered `/odds` endpoint
For `nfl_patriots_seahawks_2026-09-09_b3`, the full book landscape (regardless of our tier) is:

| Market | Books offering it |
|---|---|
| `moneyline` | betmgm, betonline, bookmaker, bovada, circa, **fanduel**, hardrock, kalshi, ladbrokes, pinnacle, rebet, stake, sx_bet, thescorebet (14 books) |
| `point_spread` | 12 books incl. fanduel, not draftkings |
| `total_points` | 13 books incl. fanduel, not draftkings |
| `player_receiving_yards` | **underdog only** (1 book) |
| `most_points_player` | **underdog only** |
| `team_total` | **pinnacle only** |

This confirms: **player props exist as a market type in their system for this game, but only Underdog has posted them — and Underdog isn't on our DK/FD tier.** So even once props appear, we may not see them until DraftKings or FanDuel posts their own lines.

For the preseason game `nfl_cardinals_panthers_2026-08-06_b3` (request #12): only `moneyline`/`point_spread`/`total_points` exist at all, offered by betmgm/bookmaker/ladbrokes/novig/betonline/onexbet — **neither DraftKings nor FanDuel has posted anything for this game.** Our tier would return zero rows for it today.

### Account usage (request #11)
```json
{"rate_limit": {"limit": 12, "remaining": 8, "reset": 1784414880}, "requests_today": 4, "active_streams": 0}
```
Confirms the 12 req/min cap is a rolling/sliding window tied to the account, not per-endpoint.

---

## Implications for FanMark's sync

1. **Don't build against NFL data yet expecting props.** Game lines (ML/spread/total) are usable today for far-future weeks, but props are the core of the bet page (`backend/CLAUDE.md` — QB/rushing/receiving/defense/kicking tabs) and there's currently zero prop coverage on our tier for NFL.
2. **Book coverage is inconsistent per game.** Some games have FanDuel lines, some have neither DK nor FD (only smaller/offshore books). A sync job needs to handle "no odds on our tier for this game yet" as a normal case, not an error — matches the `no_tier_books` warning behavior already seen in the MLB test.
3. **DraftKings currently has nothing for NFL.** If DK stays empty as the season approaches, effectively our whole NFL feed is FanDuel-only — worth re-checking closer to kickoff (or before opening week) rather than assuming DK will populate.
4. **Watch the `nfl_season_player_props` league key and the per-event `/markets` endpoint** as the season nears — `/markets` on a real event is the cheapest way to check "has anyone posted props for this game yet" (1 request) before spending budget pulling full odds.
5. **Recommended cadence to check again:** early September, right before Week 1 (`nfl_patriots_seahawks_2026-09-09`), to see if props have appeared and which book posts them first.

---

## Full endpoint list

See `sharpapi.md` — same catalog applies, nothing NFL-specific about the endpoints themselves (`sport=football&league=nfl` is just a filter on the generic `/events`, `/odds`, `/markets`, `/teams` endpoints).

---

## Market coverage vs our 22 `StatType` values (2026-07-18, zero new requests — reused cached `/markets` catalog)

Dumped all 71 `player_*` markets across every sport in SharpAPI's 432-entry catalog and cross-referenced against `backend/src/db/schema.ts` StatType enum.

**Covered (8/22):**

| StatType | SharpAPI market |
|---|---|
| PASSING_YARDS | `player_passing_yards` |
| PASSING_TOUCHDOWNS | `player_passing_touchdowns` |
| RUSHING_YARDS | `player_rushing_yards` |
| RECEIVING_YARDS | `player_receiving_yards` |
| RECEPTIONS | `player_receptions` |
| TOUCHDOWNS (generic) | `player_touchdowns` |
| SACKS | `player_sacks` |
| TACKLES_ASSISTS | `player_tackles` |

**Not covered anywhere in the catalog (14/22)** — not a "not posted yet" gap, these market types don't exist in their system at all: `PASSING_COMPLETIONS`, `PASSING_ATTEMPTS`, `PASSING_INTERCEPTIONS`, `PASSING_LONGEST`, `RUSHING_TOUCHDOWNS`, `RUSHING_ATTEMPTS`, `RUSHING_LONGEST`, `RECEIVING_TOUCHDOWNS`, `RECEIVING_LONGEST`, `RECEIVING_TARGETS`, `DEFENSIVE_INTERCEPTIONS`, `FIELD_GOALS_MADE`, `FIELD_GOAL_LONGEST`, `KICKING_POINTS`, `EXTRA_POINTS_MADE`.

Confirmed via exhaustive substring search across all 432 market ids for `field_goal`, `kicking`, `extra_point`, `interception` — **zero matches for any of them, in any sport**. Kicking has no market coverage at all; defensive interceptions specifically has none either (only `defensive_poy`, a season-award futures market, matches `defen`).

**Implication:** `fakeSync.ts` already generates real `SACKS`/`TACKLES_ASSISTS`/`DEFENSIVE_INTERCEPTIONS` props for DE/LB players (lines 215-222) and the bet page already has a working "Defensive Props" tab (`page.tsx:543,562,845`) — no code gap on our side. But once real SharpAPI data replaces fake data for sacks/tackles, **kicking props and defensive-interception props have no real-data path** and must stay on synthetic `fakeSync` generation indefinitely, or wait on a second data source.

## Request volume estimate for our actual target markets

Target set: `moneyline`, `point_spread`, `total_points` (game lines, alt lines included automatically via `is_alternate_line` flag — no separate market key) + the 8 covered player-prop markets above.

- **Game lines:** proven — 1 request covers a full week (16 games × 6 rows = 96 rows, fits one 200-row page).
- **Props:** NFL has zero props posted yet (confirmed in the main probe above), so this is extrapolated from MLB's measured density (busiest category — `player_hits` — ran ~13-14 rows/game/book). Typical NFL DK/FD prop sheets run ~100-250 lines/game/book across passing/rushing/receiving/sacks/tackles combined.

| Scenario | Rows/game/book | Full week (16 games × 2 books) | Requests needed (÷200/page) |
|---|---|---|---|
| Low | 100 | 3,200 | ~16 |
| Mid | 175 | 5,600 | ~28 |
| High | 250 | 8,000 | ~40 |

**Estimate: 20-40 requests for a full week's sync** (game lines + all 8 covered prop categories, both books), spread over 2-4 minutes at the 12 req/min cap. Comfortably fits a scheduled weekly sync window.

## Is the kicking/defensive-INT gap a preseason artifact, or permanent? (tested 2026-07-18)

Ruled out "just needs the season to start" as the explanation:

- The `/markets` catalog already lists **other NFL markets with zero current data** — `defensive_poy`, `coin_toss_result`, `first_touchdown_scorer`, `player_passing_yards` all appear despite the season not having started and none having live rows yet. So absence from the catalog isn't explained by preseason timing — if kicking/INT were a recognized market type, the key would be listed empty too, same as these.
- Tried to test via `/odds` directly (query with `market=field_goals_made,kicking_points,player_field_goals,defensive_interceptions`) — inconclusive. The API doesn't validate the `market` param: a request with a completely made-up key (`totally_fake_nonsense_market_zzz`) returns the exact same empty response shape as a real-but-currently-dataless key (`player_passing_yards`). So `/odds` can't distinguish "valid, no data yet" from "not a real market" — only the `/markets` catalog listing is meaningful evidence.

**Conclusion (revised 2026-07-18, corrected test):** the original reasoning here was flawed — it compared a global aggregated `/markets` catalog against NFL games 7+ weeks from kickoff and concluded "not a timing issue" without ever checking a football-shaped game actually close to kickoff. The FIFA World Cup Final test (see below) proved market depth scales hugely with proximity to kickoff (skeleton markets months out → 112 markets with full alt ladders 1 day out), which undercuts that original comparison.

**Corrected test:** checked `GET /events/cfl_hamiltontigercats_torontoargonauts_2026-07-18_b3/markets` — a CFL (Canadian football, same stat shape as NFL) game **~30 minutes from kickoff**, the closest to "game day" any football-family event currently gets. Result: 33 markets total. `player_passing_yards`, `player_rushing_yards`, `player_receiving_yards`, `player_receptions`, `player_touchdowns`, `player_passing_touchdowns`, `anytime_touchdown_scorer`, `first_touchdown_scorer` all populated — confirming proximity to kickoff does unlock props, same pattern as soccer. **But kicking and defensive-interception markets were still completely absent even at 30 minutes to kickoff.** (`player_sacks`/`player_tackles` were also absent here, but that's likely just low book interest in a minor CFL game, not meaningful — those two are confirmed to exist as market types elsewhere.)

**Revised conclusion:** this is now a fairly well-triangulated finding — checked at zero proximity (global catalog), medium proximity (nothing available), and maximum currently-available proximity (CFL, 30 min out) — and kicking/defensive-interception never appeared in any of them, while other prop types do appear once close enough to kickoff. Still can't rule out NFL specifically behaving differently once real Week 1 approaches, but the evidence now points toward a genuine gap in what SharpAPI's football-family books offer, not a preseason artifact. **Re-check closer to an actual NFL game** (early September) as final confirmation.

## Sync strategy: burst at week start, then `/odds/delta` hourly (tested 2026-07-18)

Confirmed tier: **Free (12 req/min)**. Docs list Hobby (120), Pro (300), Sharp (1000), Enterprise (custom) as upgrade paths. **No daily/monthly quota documented or observed** — only the per-minute rolling limit.

Plan: burst ~20-40 filtered `/odds` requests at the start of the week (game lines + all 8 covered prop markets, both books — see estimate above), then run a background worker every hour using `/odds/delta` instead of re-pulling everything.

**`/odds/delta` behavior (tested):**
- Requires `since` as an ISO 8601 timestamp — returns only rows changed after that point. Store the `updated_at` field from each response and feed it in as `since` on the next call (rolling cursor).
- **Must be scoped with the same `market=` filter as `/odds`**, or it's noisy: an unfiltered test with `since` ~75 min back returned `total: 10000` (`overflow: true`, paginated) because it includes every futures/MVP tick, not just the markets we care about. Filtered to our 11 target markets, real hourly line movement should be a small fraction of that.
- Response includes a `since_clamped` flag — seen `true` in testing, meaning there's a tier-based max lookback window that silently clamps an old `since` value. **The hourly worker should treat `since_clamped: true` as a signal to fall back to a full `/odds` re-pull** (it means a gap occurred — worker downtime, restart, etc. — and delta can no longer be trusted to have full continuity).

**Net cost:** initial burst ~20-40 requests (2-4 min), then each hourly refresh ~1-2 requests once properly market-filtered. Comfortably sustainable on the Free tier's 12/min limit with no daily cap to worry about.
