import { gunzipSync } from "zlib";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/db/db", () => ({ db: {}, dbPool: { waitingCount: 0 } }));

const board = await import("../../src/services/weekBoard");
const { cachedResponse, sendBuilt, _resetBoardResponses } = await import("../../src/services/boardResponse");

function fakeRes() {
  const headers: Record<string, string> = {};
  const res: any = {
    statusCode: 200, body: undefined as Buffer | undefined,
    setHeader: (k: string, v: string) => { headers[k.toLowerCase()] = v; },
    status(c: number) { res.statusCode = c; return res; },
    end(b?: Buffer) { res.body = b; },
    headers,
  };
  return res;
}

beforeEach(() => {
  _resetBoardResponses();
  board._resetWeekBoardCache();
});

describe("cachedResponse", () => {
  it("builds once, then serves the same bytes", async () => {
    const make = vi.fn(async () => [{ id: "w", games: [] }]);
    const a = await cachedResponse("k", make);
    const b = await cachedResponse("k", make);
    expect(make).toHaveBeenCalledTimes(1);
    expect(b).toBe(a);
    expect(JSON.parse(gunzipSync(a.gz).toString())).toEqual([{ id: "w", games: [] }]);
    expect(a.json.toString()).toBe(JSON.stringify([{ id: "w", games: [] }]));
  });

  it("shares one build between concurrent callers", async () => {
    const make = vi.fn(async () => { await new Promise((r) => setTimeout(r, 5)); return [1]; });
    await Promise.all(Array.from({ length: 30 }, () => cachedResponse("k", make)));
    expect(make).toHaveBeenCalledTimes(1);
  });

  // The whole point of keying on the markets version: an odds write must not
  // wait out the TTL.
  it("rebuilds as soon as any market is invalidated", async () => {
    const make = vi.fn(async () => [make.mock.calls.length]);
    await cachedResponse("k", make);
    board.invalidateGameMarkets("g1");
    const after = await cachedResponse("k", make);
    expect(make).toHaveBeenCalledTimes(2);
    expect(after.json.toString()).toBe("[2]");
  });

  it("rebuilds after the TTL", async () => {
    vi.useFakeTimers();
    try {
      const make = vi.fn(async () => [1]);
      await cachedResponse("k", make);
      vi.advanceTimersByTime(9_000);
      await cachedResponse("k", make);
      expect(make).toHaveBeenCalledTimes(1);
      vi.advanceTimersByTime(2_000);
      await cachedResponse("k", make);
      expect(make).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps separate keys apart", async () => {
    const full = await cachedResponse("week:1:full", async () => ["full"]);
    const lite = await cachedResponse("week:1:lite", async () => ["lite"]);
    expect(full.json.toString()).toBe('["full"]');
    expect(lite.json.toString()).toBe('["lite"]');
  });

  it("does not cache a failed build", async () => {
    const make = vi.fn().mockRejectedValueOnce(new Error("db down")).mockResolvedValue([1]);
    await expect(cachedResponse("k", make)).rejects.toThrow("db down");
    expect((await cachedResponse("k", make)).json.toString()).toBe("[1]");
  });
});

describe("sendBuilt", () => {
  it("sends gzip bytes to a client that accepts gzip", async () => {
    const b = await cachedResponse("k", async () => [1]);
    const res = fakeRes();
    sendBuilt({ headers: { "accept-encoding": "gzip, br" } }, res, b);
    expect(res.headers["content-encoding"]).toBe("gzip");
    expect(res.body).toBe(b.gz);
    expect(res.headers["etag"]).toBe(b.etag);
    expect(res.headers["vary"]).toBe("Accept-Encoding");
  });

  it("sends plain JSON to a client that does not", async () => {
    const b = await cachedResponse("k", async () => [1]);
    const res = fakeRes();
    sendBuilt({ headers: {} }, res, b);
    expect(res.headers["content-encoding"]).toBeUndefined();
    expect(res.body!.toString()).toBe("[1]");
  });

  it("answers 304 to a matching If-None-Match, weak or strong", async () => {
    const b = await cachedResponse("k", async () => [1]);
    for (const inm of [b.etag, b.etag.replace(/^W\//, ""), `"other", ${b.etag}`]) {
      const res = fakeRes();
      sendBuilt({ headers: { "if-none-match": inm, "accept-encoding": "gzip" } }, res, b);
      expect(res.statusCode).toBe(304);
      expect(res.body).toBeUndefined();
    }
  });
});

describe("loadShed", () => {
  it("passes requests while the pool keeps up, refuses them once it backs up", async () => {
    const { dbPool } = await import("../../src/db/db") as any;
    const { loadShed } = await import("../../src/middleware/loadShed");
    const next = vi.fn();

    dbPool.waitingCount = 49;
    loadShed({}, fakeRes(), next);
    expect(next).toHaveBeenCalledTimes(1);

    dbPool.waitingCount = 50;
    const res = fakeRes();
    res.json = (b: unknown) => { res.body = b; };
    loadShed({}, res, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(res.statusCode).toBe(503);
    expect(res.headers["retry-after"]).toBe("2");
  });
});
