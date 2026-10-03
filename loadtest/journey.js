/**
 * A signed-in Wagerwolf session, as k6 virtual users.
 *
 * Each iteration is one person: the shell boots, they land on their league,
 * open the bet board, read it, then check My Bets, with think time between
 * pages. The requests per page are the ones the frontend actually makes,
 * read off the components on 3 Oct 2026:
 *
 *   shell      /users/me, /memberships, /weeks/public/current (sidebar games)
 *   home       /leagues/:id, week (no markets), leaderboard, picks, gamepicks,
 *              parlays, then matchups for that week's number
 *   bet        /leagues/:id (LobbyGate), week WITH markets (the 1.86 MB board),
 *              picks, gamepicks, then /props/hit-rates
 *   my bets    /leagues/:id, week (no markets), picks, gamepicks, parlays
 *
 * READ ONLY. No bet is placed and nothing is written, so it is safe to point
 * at production. Every user is the same account: the token is minted for one
 * real member, since sign-in is Google only and there is no way to create
 * accounts in bulk. Reads are per-request work regardless of who asks, so this
 * measures the server, but nothing here exercises per-user data volume.
 *
 * Run (PowerShell or bash):
 *
 *   k6 run -e TOKEN=<jwt> -e LEAGUE=<leagueId> -e KEY=<LOADTEST_KEY> \
 *          -e PEAK=1000 loadtest/journey.js
 *
 * Or a staircase, to find where it bends: STAGES is duration:target pairs,
 *
 *   -e STAGES=2m:500,3m:500,2m:1000,3m:1000,30s:0
 *
 * KEY is the x-loadtest-key that lifts the 300/min per-IP limiter for this
 * client; without it every user shares one IP's budget and the run measures
 * 429s. BASE defaults to production.
 */
import http from "k6/http";
import { check, group, sleep } from "k6";

const BASE = __ENV.BASE || "https://api.wagerwolf.app";
const LEAGUE = __ENV.LEAGUE;
const PEAK = Number(__ENV.PEAK || 200);
const HOLD = __ENV.HOLD || "5m";
const STAGES = __ENV.STAGES
  ? __ENV.STAGES.split(",").map((st) => {
      const [duration, target] = st.split(":");
      return { duration, target: Number(target) };
    })
  : [
      { duration: "2m", target: PEAK },
      { duration: HOLD, target: PEAK },
      { duration: "30s", target: 0 },
    ];

if (!__ENV.TOKEN || !LEAGUE) throw new Error("TOKEN and LEAGUE are required");

const headers = {
  Authorization: `Bearer ${__ENV.TOKEN}`,
  "Accept-Encoding": "gzip, br",
  ...(__ENV.KEY ? { "x-loadtest-key": __ENV.KEY } : {}),
};

export const options = {
  // Bodies are fetched (so transfer and decompression are real) but not kept,
  // except where a later request needs a value out of one.
  discardResponseBodies: true,
  scenarios: {
    users: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: STAGES,
      gracefulRampDown: "30s",
    },
  },
  thresholds: {
    // ABORT_FAIL_RATE ends the run on its own once that share of requests has
    // failed, after a minute's grace. Under overload the API sheds load with
    // 503s, so this is the point past which a staircase stops telling you
    // anything new. Cumulative over the run, so it trips late, not early.
    http_req_failed: __ENV.ABORT_FAIL_RATE
      ? [{ threshold: `rate<${__ENV.ABORT_FAIL_RATE}`, abortOnFail: true, delayAbortEval: "1m" }]
      : ["rate<0.01"],
    "http_req_duration{page:bet}": ["p(95)<1500"],
    "http_req_duration{page:home}": ["p(95)<500"],
  },
  summaryTrendStats: ["avg", "med", "p(90)", "p(95)", "p(99)", "max"],
};

const think = (lo, hi) => sleep(lo + Math.random() * (hi - lo));

function get(path, page, name, keepBody = false) {
  return ["GET", `${BASE}${path}`, null, {
    headers,
    tags: { page, name },
    responseType: keepBody ? "text" : "none",
  }];
}

export default function () {
  const L = LEAGUE;

  group("shell", () => {
    const rs = http.batch([
      get("/users/me", "shell", "users/me"),
      get("/memberships", "shell", "memberships"),
      get("/weeks/public/current", "shell", "weeks/public/current"),
    ]);
    check(rs, { "shell 200": (r) => r.every((x) => x.status === 200) });
  });

  let weekNumber = null;
  group("home", () => {
    const rs = http.batch([
      get(`/leagues/${L}`, "home", "leagues/:id"),
      get(`/weeks?current=true&leagueId=${L}&markets=none`, "home", "weeks?markets=none", true),
      get(`/leagues/${L}/leaderboard`, "home", "leaderboard"),
      get(`/picks?leagueId=${L}`, "home", "picks"),
      get(`/gamepicks?leagueId=${L}`, "home", "gamepicks"),
      get(`/parlays?leagueId=${L}`, "home", "parlays"),
    ]);
    check(rs, { "home 200": (r) => r.every((x) => x.status === 200) });
    try { weekNumber = JSON.parse(rs[1].body)[0]?.number ?? null; } catch (_) { /* keep null */ }
    if (weekNumber != null) {
      const m = http.get(`${BASE}/leagues/${L}/matchups?weekNumber=${weekNumber}`,
        { headers, tags: { page: "home", name: "matchups" }, responseType: "none" });
      check(m, { "matchups 200": (r) => r.status === 200 });
    }
  });
  think(5, 20);

  group("bet", () => {
    const rs = http.batch([
      get(`/leagues/${L}`, "bet", "leagues/:id"),
      get(`/weeks?current=true&leagueId=${L}`, "bet", "weeks (board)"),
      get(`/picks?leagueId=${L}`, "bet", "picks"),
      get(`/gamepicks?leagueId=${L}`, "bet", "gamepicks"),
    ]);
    const hr = http.get(`${BASE}/props/hit-rates`,
      { headers, tags: { page: "bet", name: "props/hit-rates" }, responseType: "none" });
    check([...rs, hr], { "bet 200": (r) => r.every((x) => x.status === 200) });
  });
  // Reading a board of 16 games takes a while.
  think(20, 60);

  group("mybets", () => {
    const rs = http.batch([
      get(`/leagues/${L}`, "mybets", "leagues/:id"),
      get(`/weeks?current=true&leagueId=${L}&markets=none`, "mybets", "weeks?markets=none"),
      get(`/picks?leagueId=${L}`, "mybets", "picks"),
      get(`/gamepicks?leagueId=${L}`, "mybets", "gamepicks"),
      get(`/parlays?leagueId=${L}`, "mybets", "parlays"),
    ]);
    check(rs, { "mybets 200": (r) => r.every((x) => x.status === 200) });
  });
  think(10, 30);
}
