import { describe, expect, it, vi } from "vitest";
import type { ErrorEvent } from "@sentry/node";
import {
  makeFatalHandler,
  parseDsn,
  parseSampleRate,
  scrubEvent,
  scrubQueryParams,
} from "../../src/lib/sentryConfig";

describe("parseDsn", () => {
  it("is off when unset, empty or whitespace", () => {
    expect(parseDsn(undefined)).toBeUndefined();
    expect(parseDsn("")).toBeUndefined();
    expect(parseDsn("  \n")).toBeUndefined();
  });

  it("trims the newline a pasted secret carries", () => {
    expect(parseDsn("https://k@o1.ingest.sentry.io/2\n")).toBe("https://k@o1.ingest.sentry.io/2");
  });
});

describe("parseSampleRate", () => {
  it.each([
    [undefined, undefined],
    ["", undefined],
    ["   ", undefined],
    ["abc", undefined],
    ["NaN", undefined],
    ["Infinity", undefined],
    ["0", undefined],
    ["-0.5", undefined],
    ["0.25", 0.25],
    [" 1 ", 1],
    ["2", 1],
  ])("%j -> %j", (raw, expected) => {
    expect(parseSampleRate(raw)).toBe(expected);
  });
});

describe("scrubQueryParams", () => {
  it("drops bound values and keeps the SQL", () => {
    const msg = 'Failed query: select * from "users" where "email" = $1\nparams: someone@example.com';
    expect(scrubQueryParams(msg)).toBe('Failed query: select * from "users" where "email" = $1\nparams: [scrubbed]');
  });

  it("drops params that span several lines", () => {
    const msg = "Failed query: insert into x values ($1)\nparams: line one\nline two";
    expect(scrubQueryParams(msg)).toBe("Failed query: insert into x values ($1)\nparams: [scrubbed]");
  });

  it("leaves an ordinary message alone", () => {
    expect(scrubQueryParams("connect ECONNREFUSED 127.0.0.1:5432")).toBe("connect ECONNREFUSED 127.0.0.1:5432");
  });
});

describe("scrubEvent", () => {
  const event = (over: Partial<ErrorEvent> = {}): ErrorEvent => ({ type: undefined, ...over }) as ErrorEvent;

  it("removes secrets, body, cookies and IP, keeping the rest", () => {
    const out = scrubEvent(
      event({
        user: { id: "42", ip_address: "203.0.113.9" },
        request: {
          url: "https://api.wagerwolf.app/support",
          data: { email: "someone@example.com", body: "help" },
          cookies: { session: "x" },
          headers: {
            Authorization: "Bearer secret",
            "x-loadtest-key": "k",
            "X-Cron-Secret": "c",
            cookie: "a=b",
            "user-agent": "curl/8",
          },
        },
      })
    );
    expect(out.user).toEqual({ id: "42" });
    expect(out.request?.data).toBeUndefined();
    expect(out.request?.cookies).toBeUndefined();
    expect(out.request?.headers).toEqual({ "user-agent": "curl/8" });
    expect(out.request?.url).toBe("https://api.wagerwolf.app/support");
  });

  it("scrubs query params from every exception value and from the message", () => {
    const out = scrubEvent(
      event({
        message: "Failed query: select 1\nparams: secret-a",
        exception: {
          values: [
            { type: "DrizzleQueryError", value: "Failed query: select $1\nparams: secret-b" },
            { type: "Error" },
          ],
        },
      })
    );
    expect(out.message).toBe("Failed query: select 1\nparams: [scrubbed]");
    expect(out.exception?.values?.[0].value).toBe("Failed query: select $1\nparams: [scrubbed]");
    expect(out.exception?.values?.[1].value).toBeUndefined();
  });

  it("copes with an event that has none of those fields", () => {
    expect(() => scrubEvent(event())).not.toThrow();
    expect(() => scrubEvent(event({ request: {} }))).not.toThrow();
  });
});

describe("makeFatalHandler", () => {
  const setup = (over: Partial<Parameters<typeof makeFatalHandler>[0]> = {}) => {
    const deps = {
      capture: vi.fn(),
      flush: vi.fn().mockResolvedValue(true),
      exit: vi.fn(),
      log: vi.fn(),
      ...over,
    };
    return { deps, fatal: makeFatalHandler(deps) };
  };

  it("reports, flushes and exits 1, in that order", async () => {
    const order: string[] = [];
    const { fatal } = setup({
      capture: vi.fn(() => void order.push("capture")),
      flush: vi.fn(async () => void order.push("flush")),
      exit: vi.fn(() => void order.push("exit")),
    });
    const err = new Error("boom");
    await fatal("uncaughtException", err);
    expect(order).toEqual(["capture", "flush", "exit"]);
  });

  it("passes the error and its kind to capture", async () => {
    const { deps, fatal } = setup();
    const err = new Error("boom");
    await fatal("unhandledRejection", err);
    expect(deps.capture).toHaveBeenCalledWith(err, "unhandledRejection");
    expect(deps.exit).toHaveBeenCalledWith(1);
  });

  it("still exits when reporting throws", async () => {
    const { deps, fatal } = setup({ capture: vi.fn(() => { throw new Error("sdk broke"); }) });
    await fatal("uncaughtException", new Error("boom"));
    expect(deps.exit).toHaveBeenCalledWith(1);
    expect(deps.flush).not.toHaveBeenCalled();
  });

  it("still exits when the flush rejects", async () => {
    const { deps, fatal } = setup({ flush: vi.fn().mockRejectedValue(new Error("network")) });
    await fatal("uncaughtException", new Error("boom"));
    expect(deps.exit).toHaveBeenCalledWith(1);
  });

  it("does not start a second shutdown for a failure during the first", async () => {
    let release!: () => void;
    const { deps, fatal } = setup({ flush: vi.fn(() => new Promise<void>((r) => (release = r))) });
    const first = fatal("uncaughtException", new Error("one"));
    await fatal("unhandledRejection", new Error("two"));
    expect(deps.capture).toHaveBeenCalledTimes(1);
    expect(deps.log).toHaveBeenCalledTimes(2); // both are still logged
    release();
    await first;
    expect(deps.exit).toHaveBeenCalledTimes(1);
  });

  it("handles a rejection reason that is not an Error", async () => {
    const { deps, fatal } = setup();
    await fatal("unhandledRejection", undefined);
    await makeFatalHandler(deps)("unhandledRejection", "just a string");
    expect(deps.exit).toHaveBeenCalledTimes(2);
  });
});
