import { beforeEach, describe, expect, it, vi } from "vitest";

// The module under test reads through `db.query`; nothing else of the db is
// touched, so a two-method stand-in is the whole database.
const reads: string[][] = [];
let gate: Promise<void> | null = null;
let propsByGame: Record<string, number> = {};

vi.mock("../../src/db/db", () => ({
  db: {
    query: {
      props: {
        findMany: vi.fn(async () => {
          const ids = reads[reads.length - 1];
          if (gate) await gate;
          return ids.flatMap((gameId) =>
            Array.from({ length: propsByGame[gameId] ?? 1 }, (_, i) => ({ id: `${gameId}-p${i}`, gameId })));
        }),
      },
      gameLines: {
        findMany: vi.fn(async () => {
          const ids = reads[reads.length - 1];
          if (gate) await gate;
          return ids.map((gameId) => ({ id: `${gameId}-l`, gameId }));
        }),
      },
    },
  },
}));

// `inArray` only builds the WHERE; record which games each read asked for.
vi.mock("drizzle-orm", async (orig) => ({
  ...(await orig<typeof import("drizzle-orm")>()),
  inArray: (_col: unknown, ids: string[]) => { reads.push(ids); return ids; },
}));

const board = await import("../../src/services/weekBoard");

// Each load issues two queries (props and lines), each pushing its ids once.
const loads = () => reads.length / 2;

beforeEach(() => {
  board._resetWeekBoardCache();
  reads.length = 0;
  gate = null;
  propsByGame = {};
});

describe("marketsForGames", () => {
  it("reads once, then serves from memory", async () => {
    const a = await board.marketsForGames(["g1", "g2"]);
    const b = await board.marketsForGames(["g1", "g2"]);
    expect(loads()).toBe(1);
    expect(a.get("g1")!.props).toHaveLength(1);
    expect(b.get("g2")!.gameLines[0].id).toBe("g2-l");
  });

  it("gives a game with no markets empty arrays", async () => {
    propsByGame = { g1: 0 };
    const m = await board.marketsForGames(["g1"]);
    expect(m.get("g1")).toEqual({ props: [], gameLines: [{ id: "g1-l", gameId: "g1" }] });
  });

  it("shares one read between concurrent callers", async () => {
    let open!: () => void;
    gate = new Promise((r) => { open = r; });
    const pending = Array.from({ length: 50 }, () => board.marketsForGames(["g1", "g2"]));
    open();
    const results = await Promise.all(pending);
    expect(loads()).toBe(1);
    expect(results.every((m) => m.get("g1")!.props.length === 1)).toBe(true);
  });

  it("re-reads only the game that was invalidated", async () => {
    await board.marketsForGames(["g1", "g2", "g3"]);
    board.invalidateGameMarkets("g2");
    propsByGame = { g2: 3 };
    const m = await board.marketsForGames(["g1", "g2", "g3"]);
    expect(reads[reads.length - 1]).toEqual(["g2"]);
    expect(m.get("g2")!.props).toHaveLength(3);
  });

  it("re-reads everything after invalidateAllMarkets", async () => {
    await board.marketsForGames(["g1", "g2"]);
    board.invalidateAllMarkets();
    await board.marketsForGames(["g1", "g2"]);
    expect(loads()).toBe(2);
  });

  // The race the generations exist for: a read that started before a write
  // and finished after it must not be cached as current.
  it("does not cache a read that a write overtook", async () => {
    let open!: () => void;
    gate = new Promise((r) => { open = r; });
    const stale = board.marketsForGames(["g1"]);
    board.invalidateGameMarkets("g1");
    open();
    await stale;
    gate = null;
    await board.marketsForGames(["g1"]);
    expect(loads()).toBe(2);
  });

  it("expires entries after the TTL", async () => {
    vi.useFakeTimers();
    try {
      await board.marketsForGames(["g1"]);
      vi.advanceTimersByTime(5 * 60 * 60_000);
      await board.marketsForGames(["g1"]);
      expect(loads()).toBe(1);
      vi.advanceTimersByTime(2 * 60 * 60_000);
      await board.marketsForGames(["g1"]);
      expect(loads()).toBe(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("lets a failed read be retried", async () => {
    const { db } = await import("../../src/db/db");
    vi.mocked(db.query.props.findMany).mockRejectedValueOnce(new Error("db down"));
    await expect(board.marketsForGames(["g1"])).rejects.toThrow("db down");
    const m = await board.marketsForGames(["g1"]);
    expect(m.get("g1")!.props).toHaveLength(1);
  });
});
