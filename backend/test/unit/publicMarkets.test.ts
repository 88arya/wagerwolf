import { beforeEach, describe, expect, it, vi } from "vitest";

// A fake "Week" row and the tables the sample reads. `sql` is mocked to a
// plain { text, values } so db.execute can tell the queries apart.
type Fake = {
  stored: any;
  props: { player: string }[];
  lines: number;
  updates: number;
};
const fake: Fake = { stored: null, props: [], lines: 0, updates: 0 };

vi.mock("drizzle-orm", async (orig) => ({
  ...(await orig<typeof import("drizzle-orm")>()),
  sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({ text: strings.join("?"), values }),
}));

vi.mock("../../src/services/currentWeek", () => ({ currentWeekId: async () => "w1" }));

const sumOf = (b: any) => (b?.totals?.lines ?? 0) + (b?.totals?.props ?? 0);

vi.mock("../../src/db/db", () => ({
  db: {
    execute: vi.fn(async ({ text, values }: { text: string; values: unknown[] }) => {
      if (text.includes('DISTINCT ON (p."playerId")')) {
        return fake.props.map((p) => ({
          player: p.player, team: "KC", position: "QB", espn: 1, stat: "PASSING_YARDS",
          line: 250.5, odds: -110, game: "BUF vs KC",
        }));
      }
      if (text.includes('FROM "GameLine" gl')) return [];
      if (text.includes("count(*)")) return [{ lines: fake.lines, props: fake.props.length }];
      if (text.includes('SELECT "publicBoard" AS board')) return [{ board: fake.stored }];
      if (text.includes('"publicBoard" IS NULL')) {
        if (fake.stored) return [];
        fake.stored = JSON.parse(values[0] as string);
        return [{ id: "w1" }];
      }
      if (text.includes('SET "publicBoard" =')) {
        const next = JSON.parse(values[0] as string);
        const sum = values[values.length - 1] as number;
        if (fake.stored && sumOf(fake.stored) < sum) { fake.stored = next; fake.updates++; }
        return [];
      }
      throw new Error("unexpected query: " + text);
    }),
  },
}));

const players = (n: number, from = 0) => Array.from({ length: n }, (_, i) => ({ player: `P${from + i}` }));
const names = (b: { markets: any[] }) => b.markets.map((m) => m.player).sort();

let now = 0;
async function load() {
  vi.resetModules();
  return import("../../src/services/publicMarkets");
}

beforeEach(() => {
  fake.stored = null;
  fake.props = [];
  fake.lines = 0;
  fake.updates = 0;
  now = 1_000_000;
  vi.spyOn(Date, "now").mockImplementation(() => now);
});

describe("cachedPublicBoard", () => {
  it("rebuilds the sample when props land after the rollover snapshot", async () => {
    const svc = await load();
    fake.props = players(2);
    fake.lines = 10;
    const first = await svc.cachedPublicBoard(500);
    expect(names(first)).toEqual(["P0", "P1"]);

    fake.props = players(7);
    now += 5 * 60_000;
    const later = await svc.cachedPublicBoard(500);
    expect(names(later)).toHaveLength(7);
    expect(later.totals).toEqual({ lines: 10, props: 7 });
    expect(fake.stored.markets).toHaveLength(7);
  });

  it("does not look again inside the refresh window", async () => {
    const svc = await load();
    fake.props = players(2);
    await svc.cachedPublicBoard(500);
    fake.props = players(7);
    now += 60_000;
    expect(names(await svc.cachedPublicBoard(500))).toHaveLength(2);
  });

  it("raises totals but keeps the sample when only lines grew", async () => {
    const svc = await load();
    fake.props = players(3);
    fake.lines = 10;
    await svc.cachedPublicBoard(500);
    fake.lines = 40;
    now += 5 * 60_000;
    const b = await svc.cachedPublicBoard(500);
    expect(b.totals).toEqual({ lines: 40, props: 3 });
    expect(names(b)).toEqual(["P0", "P1", "P2"]);
  });

  it("writes nothing when the board has not grown", async () => {
    const svc = await load();
    fake.props = players(3);
    await svc.cachedPublicBoard(500);
    now += 5 * 60_000;
    await svc.cachedPublicBoard(500);
    expect(fake.updates).toBe(0);
  });

  it("never moves the stored board backwards", async () => {
    const svc = await load();
    fake.props = players(2);
    await svc.cachedPublicBoard(500);
    // Another replica already stored a bigger board than this one will see.
    fake.stored = { markets: players(9).map((p) => ({ kind: "prop", ...p })), totals: { lines: 0, props: 9 } };
    fake.props = players(5);
    now += 5 * 60_000;
    const b = await svc.cachedPublicBoard(500);
    expect(b.markets).toHaveLength(9);
    expect(fake.updates).toBe(0);
  });

  it("serves nothing and stores nothing while the week has no odds", async () => {
    const svc = await load();
    const b = await svc.cachedPublicBoard(500);
    expect(b.markets).toEqual([]);
    expect(fake.stored).toBeNull();
  });
});
