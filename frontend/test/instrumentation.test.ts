/**
 * instrumentation.ts and instrumentation-client.ts read the DSN when the module
 * loads, the way Next inlines it at build time. So each case sets the env, then
 * imports a fresh copy of the module.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const nextjs = vi.hoisted(() => {
  const scope = { setTag: vi.fn() };
  return {
    scope,
    init: vi.fn(),
    captureRequestError: vi.fn(),
    withScope: vi.fn((cb: (s: typeof scope) => void) => cb(scope)),
  };
});
const browser = vi.hoisted(() => ({ init: vi.fn() }));
vi.mock("@sentry/nextjs", () => nextjs);
vi.mock("@sentry/browser", () => browser);

const REQUEST = { path: "/leagues/1", method: "GET", headers: {} };
const CONTEXT = {
  routerKind: "App Router",
  routePath: "/leagues/[leagueId]",
  routeType: "render",
  revalidateReason: undefined,
} as const;

async function load(env: Record<string, string | undefined>) {
  vi.resetModules();
  for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v as string);
  return import("../instrumentation");
}

beforeEach(() => {
  for (const f of [nextjs.init, nextjs.captureRequestError, nextjs.withScope, nextjs.scope.setTag, browser.init]) {
    f.mockClear();
  }
});

describe("register", () => {
  it.each([
    ["no DSN", { NEXT_PUBLIC_SENTRY_DSN: "", NEXT_RUNTIME: "nodejs" }],
    ["a blank DSN", { NEXT_PUBLIC_SENTRY_DSN: "  \n", NEXT_RUNTIME: "nodejs" }],
    ["the edge runtime", { NEXT_PUBLIC_SENTRY_DSN: "https://k@o1.ingest.sentry.io/2", NEXT_RUNTIME: "edge" }],
  ])("does nothing with %s", async (_what, env) => {
    const mod = await load(env);
    await mod.register();
    expect(nextjs.init).not.toHaveBeenCalled();
  });

  it("initialises with the trimmed DSN and the build's commit", async () => {
    const mod = await load({
      NEXT_PUBLIC_SENTRY_DSN: "https://k@o1.ingest.sentry.io/2\n",
      NEXT_PUBLIC_GIT_COMMIT_SHA: "abc1234",
      NEXT_RUNTIME: "nodejs",
    });
    await mod.register();
    expect(nextjs.init).toHaveBeenCalledOnce();
    expect(nextjs.init.mock.calls[0][0]).toMatchObject({
      dsn: "https://k@o1.ingest.sentry.io/2",
      release: "abc1234",
    });
  });

  it("strips the IP and cookies before an event leaves", async () => {
    const mod = await load({ NEXT_PUBLIC_SENTRY_DSN: "https://k@o1.ingest.sentry.io/2", NEXT_RUNTIME: "nodejs" });
    await mod.register();
    const { beforeSend } = nextjs.init.mock.calls[0][0];
    const out = beforeSend({
      user: { id: "1", ip_address: "203.0.113.9" },
      request: { cookies: { docs_theme: "dark" }, headers: { cookie: "docs_theme=dark", "user-agent": "x" } },
    });
    expect(out.user).toEqual({ id: "1" });
    expect(out.request.cookies).toBeUndefined();
    expect(out.request.headers).toEqual({ "user-agent": "x" });
    expect(() => beforeSend({})).not.toThrow();
  });
});

describe("onRequestError", () => {
  const configured = { NEXT_PUBLIC_SENTRY_DSN: "https://k@o1.ingest.sentry.io/2", NEXT_RUNTIME: "nodejs" };

  it("reports nothing when unconfigured", async () => {
    const mod = await load({ NEXT_PUBLIC_SENTRY_DSN: "", NEXT_RUNTIME: "nodejs" });
    await mod.onRequestError(new Error("x"), REQUEST, CONTEXT);
    expect(nextjs.captureRequestError).not.toHaveBeenCalled();
  });

  it("tags the digest, which is the reference error.tsx shows the user", async () => {
    const mod = await load(configured);
    const err = Object.assign(new Error("render failed"), { digest: "4286623152" });
    await mod.onRequestError(err, REQUEST, CONTEXT);
    expect(nextjs.scope.setTag).toHaveBeenCalledWith("digest", "4286623152");
    expect(nextjs.captureRequestError).toHaveBeenCalledWith(err, REQUEST, CONTEXT);
  });

  it("stringifies a numeric digest", async () => {
    const mod = await load(configured);
    await mod.onRequestError(Object.assign(new Error("x"), { digest: 42 }), REQUEST, CONTEXT);
    expect(nextjs.scope.setTag).toHaveBeenCalledWith("digest", "42");
  });

  it.each([
    ["an error with no digest", new Error("x")],
    ["a thrown string", "just a string"],
    ["null", null],
    ["undefined", undefined],
  ])("still reports %s, without a digest tag", async (_what, err) => {
    const mod = await load(configured);
    await mod.onRequestError(err, REQUEST, CONTEXT);
    expect(nextjs.scope.setTag).not.toHaveBeenCalled();
    expect(nextjs.captureRequestError).toHaveBeenCalledOnce();
  });
});

describe("instrumentation-client", () => {
  async function loadClient(dsn: string) {
    vi.resetModules();
    vi.stubEnv("NEXT_PUBLIC_SENTRY_DSN", dsn);
    await import("../instrumentation-client");
  }

  it("initialises the browser SDK when a DSN was built in", async () => {
    await loadClient(" https://k@o1.ingest.sentry.io/3 ");
    expect(browser.init).toHaveBeenCalledOnce();
    expect(browser.init.mock.calls[0][0].dsn).toBe("https://k@o1.ingest.sentry.io/3");
  });

  it.each(["", "   "])("stays off for %j", async (dsn) => {
    await loadClient(dsn);
    expect(browser.init).not.toHaveBeenCalled();
  });
});
