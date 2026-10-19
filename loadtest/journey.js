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
    check(rs, { "bet 200": (r) => r.every((x) => x.status === 200) });
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
