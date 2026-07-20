# SharpAPI — NFL/MLB Odds API Reference (FanMark)

Replacement candidate for SportsGameOdds. Everything below was verified live against the API on 2026-07-18 using our key (MLB, since NFL season isn't live yet).

- **Base URL:** `https://api.sharpapi.io`
- **Docs:** https://docs.sharpapi.io/en/api-reference/overview/
- **Auth:** `X-API-Key: <key>` header (also supports `Authorization: Bearer` or `?api_key=` query param for SSE)
- **Key:** stored in `backend/.env` (rotate the one used for testing — it appeared in chat/shell history)

---

## Our tier limits (verified)

- **Sportsbooks: DraftKings + FanDuel only.** Other books (bet365 etc.) exist in the data but odds requests return a `no_tier_books` filter warning and empty `data`. Always pass `sportsbook=draftkings,fanduel` to avoid empty responses on events whose only book is blocked.
- **Rate limit: 12 requests/min.** Confirmed by hitting it — error body:
  ```json
  {"error": {"code": "rate_limited", "limit": 12, "remaining": 0, "retryAfter": 47}}
  ```
  `retryAfter` is seconds. Any sync job must throttle to ~10 req/min to be safe.

---

## Endpoint catalog (from docs)

All prefixed `/api/v1`. Everything requires the API key except `/health` and `/deeplink/:id`.

| Group | Endpoints |
|---|---|
| Odds | `GET /odds`, `/odds/delta`, `/odds/best`, `/odds/comparison`, `/odds/closing`, `/odds/export`, `POST /odds/batch` |
| Events | `GET /events`, `/events/:eventId`, `/events/:eventId/odds`, `/events/:eventId/markets` |
| Reference | `GET /sports`, `/leagues`, `/sportsbooks`, `/markets`, `/teams`, `/injuries` |
| Live state | `GET /gamestate`, `/gamestate/:sport` |
| Streaming (paid add-on) | `GET /stream`, `/stream/odds`, `/stream/opportunities`, `/stream/all`, `/stream/events/:eventId`, `/stream/gamestate` |
| Opportunities | `GET /opportunities/ev`, `/arbitrage`, `/middles`, `/low_hold` — not needed for FanMark |
| Account | `GET /account`, `/account/usage`, `/account/keys`, `POST /account/keys`, `POST /account/keys/:keyId/rotate` |
| Historical (Enterprise) | `/historical/odds`, `/historical/odds/closing`, etc. — not on our tier |

NFL is **not** a separate endpoint set — same endpoints filtered by `sport=football` / `league=nfl`.

---

## What we tested and what came back

### 1. `GET /sports`
Lists every sport with `event_count`, `live_count`, and league keys.

- `baseball` → 812 events, 34 live. League keys include `mlb`, `npb`, `kbo`, `college_baseball`, plus junk/dupe keys (`am_rica_do_norte_-_mlb`, `north_america_-_mlb_price_boost`) — **filter on the clean `mlb` key only**.
- `football` → 1,597 events even in July (futures/preseason). NFL will use `sport=football&league=nfl`.

### 2. `GET /markets?sport=baseball`
433 market types across all sports (endpoint doesn't actually filter much by sport). Keys are snake_case, e.g. `moneyline`, `run_line`, `total_runs`, `player_hits`, `player_home_runs`, `player_strikeouts`.

### 3. `GET /events?sport=baseball&league=mlb`
Returned 50 events. Shape:

```json
{
  "id": "mlb_mets_phillies_2026-07-18_b3",
  "uuid": "1f53d081539bdf2c",
  "external_ids": {"bet365 us": "198072673", "caesars": "..."},
  "sport": "baseball",
  "league": "mlb",
  "home_team": "Philadelphia Phillies",
  "away_team": "New York Mets",
  "start_time": "2026-07-18T22:00:00Z",
  "status": "upcoming",
  "is_live": false,
  "book_count": 1,
  "market_count": 1,
  "markets": ["run_line"],
  "books": ["bet365 us"]
}
```

Gotchas:
- The list mixes real games with **player-award/futures pseudo-events** (`home_team: "James Wood", away_team: ""`) — filter to events where both teams are non-empty.
- The same matchup can appear under multiple event IDs (`..._b2`, `..._b3` suffixes) from different book feeds. Check the `books` array before using an event.

### 4. `GET /events/:eventId/odds`
Works, but returns `"data": []` with a `filter_warning` (`code: no_tier_books`, `required_tier: hobby`) when the event's books aren't on our tier. This is how we discovered the DK/FD restriction.

### 5. `GET /odds?sport=baseball&league=mlb&sportsbook=draftkings,fanduel&limit=200`
The main workhorse. Paged through 12 pages = **2,400 rows across 11 games**.

**Pagination:** cursor-based. `limit` caps at 200. Response includes:
```json
"pagination": {"limit": 200, "offset": 0, "count": 200, "has_more": true, "next_cursor": "eyJ..."}
```
Pass `&cursor=<next_cursor>` for the next page.

**Row shape (one row per selection, not per market):**
```json
{
  "id": "127112810683537",
  "sportsbook": "draftkings",
  "event_id": "mlb_mets_phillies_2026-07-18_b2",
  "market_type": "player_home_runs",
  "selection": "Francisco Alvarez",
  "selection_type": "over",
  "odds_american": 1800,
  "odds_decimal": 19,
  "odds_probability": 0.0526,
  "line": 0.5,
  "event_start_time": "2026-07-18T19:06Z",
  "is_live": true,
  "player_name": "Francisco Alvarez",
  "stat_category": "home_runs",
  "market_id": "352569706",
  "is_alternate_line": false,
  "is_main_line": true,
  "is_player_prop": true,
  "deep_link": "https://api.sharpapi.io/api/v1/deeplink/127112810683537",
  "home": {"id": "philadelphia_phillies", "abbreviation": "PHI", "logo": "https://cdn.sharpapi.io/teams/baseball/21.png", "...": "..."},
  "away": {"id": "new_york_mets", "abbreviation": "NYM", "...": "..."}
}
```

**Aggregate results from the 2,400-row pull:**
- Game lines: `moneyline`, `run_line` (spread), `total_runs` (total), `team_total`, per-inning moneylines, 1st-3/5/7-innings lines, `correct_score`, `winning_margin`, odd/even
- Player props: **14 stat categories, 104 distinct players** — hits (298 rows), rbis (260), home_runs (229), runs (169), doubles (114), singles (112), total_bases (106), hits_runs_rbis (102), walks (78), triples (39), stolen_bases (17), hits_allowed (12), strikeouts_pitcher (10), earned_runs (6)
- Books: fanduel 1,333 rows, draftkings 1,067
- Alt lines: 810 rows `is_alternate_line: true`, 1,319 `is_main_line: true`
- Live vs pregame: 345 live, 2,055 pregame

---

## How this maps to FanMark

| SharpAPI | FanMark |
|---|---|
| `market_type: moneyline` | GameLine ML |
| `market_type: run_line` (NFL: `point_spread`) | GameLine spread |
| `market_type: total_runs` (NFL: `total_points`) | GameLine total |
| `is_player_prop: true` rows | `Prop` — `player_name` + `stat_category` + `line` |
| `stat_category` | maps to our `StatType` enum (NFL: passing_yards → `PASSING_YARDS`, etc.) |
| `is_alternate_line: true` | our `ALT_` markets — native alt lines, no fabrication needed |
| `odds_american` | our American odds fields |
| `home.abbreviation` / `away.abbreviation` | our team abbreviations (KC, BUF…) — direct match |

**Integration notes for `sharpApi.ts`:**
1. One row = one selection. Group by `market_id` + `line` to pair over/under (or home/away) into a single Prop/GameLine.
2. Two books means conflicting lines for the same market — pick one book as primary (e.g. DraftKings) and fall back to the other.
3. Filter events: both team names non-empty, clean league key, `status: upcoming` for seeding.
4. Throttle to ≤10 req/min; a full-league sync is ~12–15 pages, so the odds sync cron should fetch pages with ~6s spacing.
5. NFL props aren't verifiable until season is live, but the schema is sport-agnostic (`player_*` markets + `stat_category`), so the same code path will work. Verify NFL `stat_category` values against our 22 StatTypes when lines appear (~September 2026).

---

## Why MLB was tested instead of NFL

NFL season isn't live (July). MLB is in-season, so it proves the full pipeline: events → odds → props → alt lines → live odds. Football already shows 1,597 events (futures/preseason), and prop markets are generic across sports, so NFL coverage will surface through identical calls once games have lines.
