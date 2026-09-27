import { beforeEach, describe, expect, it, vi } from "vitest";
import { heartbeat, heartbeatUrl, toSlug } from "../../src/lib/heartbeat";

describe("toSlug", () => {
  it("keeps job names as they are", () => {
    expect(toSlug("resolve-and-allowances")).toBe("resolve-and-allowances");
  });

  it("makes anything else URL-safe", () => {
    expect(toSlug("Score Sync/v2 ")).toBe("score-sync-v2");
    expect(toSlug("../../admin")).toBe("admin");
  });
});

describe("heartbeatUrl", () => {
  it("is off without a key, including a blank one", () => {
    expect(heartbeatUrl("score-sync", true, {})).toBeUndefined();
    expect(heartbeatUrl("score-sync", true, { HEALTHCHECKS_PING_KEY: "  \n" })).toBeUndefined();
  });

  it("builds success and fail URLs, trimming the key", () => {
    const env = { HEALTHCHECKS_PING_KEY: " abc123\n" };
    expect(heartbeatUrl("score-sync", true, env)).toBe("https://hc-ping.com/abc123/score-sync?create=1");
    expect(heartbeatUrl("score-sync", false, env)).toBe("https://hc-ping.com/abc123/score-sync/fail?create=1");
  });

  it("honours a base URL override, with or without a trailing slash", () => {
    const env = { HEALTHCHECKS_PING_KEY: "k", HEALTHCHECKS_PING_URL: "http://127.0.0.1:9/ping///" };
    expect(heartbeatUrl("odds-poll", true, env)).toBe("http://127.0.0.1:9/ping/k/odds-poll?create=1");
  });

  it("encodes a key that would otherwise change the path", () => {
    expect(heartbeatUrl("x", true, { HEALTHCHECKS_PING_KEY: "a/b?c" })).toBe(
      "https://hc-ping.com/a%2Fb%3Fc/x?create=1"
    );
  });
});

describe("heartbeat", () => {
  beforeEach(() => {
    vi.stubEnv("HEALTHCHECKS_PING_KEY", "key");
    vi.stubEnv("HEALTHCHECKS_PING_URL", "");
  });

  it("sends nothing when unconfigured", async () => {
    vi.stubEnv("HEALTHCHECKS_PING_KEY", "");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await heartbeat("score-sync", true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("POSTs to the check with a timeout signal", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("OK"));
    vi.stubGlobal("fetch", fetchMock);
    await heartbeat("score-sync", false);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://hc-ping.com/key/score-sync/fail?create=1");
    expect(init.method).toBe("POST");
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("never throws when the network does", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("fetch failed")));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await expect(heartbeat("score-sync", true)).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledWith("[heartbeat] score-sync: ping failed", "fetch failed");
  });

  it("warns when healthchecks rejects the ping, which is what a wrong key looks like", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("not found", { status: 404 })));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await heartbeat("score-sync", true);
    expect(warn.mock.calls[0][0]).toMatch(/answered 404; check HEALTHCHECKS_PING_KEY/);
  });

  it("gives up on a ping that never answers", async () => {
    // A fetch that only ever settles by honouring its abort signal.
    vi.stubGlobal(
      "fetch",
      vi.fn((_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => init.signal!.addEventListener("abort", () => reject(init.signal!.reason)))
      )
    );
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const started = Date.now();
    await heartbeat("score-sync", true, 50);
    expect(Date.now() - started).toBeLessThan(2000);
    expect(warn).toHaveBeenCalledOnce();
  });
});
