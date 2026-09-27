import { beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";

const sentry = vi.hoisted(() => {
  const scope = { setTag: vi.fn(), setUser: vi.fn() };
  return {
    scope,
    captureException: vi.fn(),
    withScope: vi.fn((cb: (s: typeof scope) => void) => cb(scope)),
  };
});
vi.mock("@sentry/node", () => sentry);

import { errorHandler, HttpError, notFoundHandler } from "../../src/middleware/errorHandler";

function app(route: express.RequestHandler, opts: { userId?: number } = {}) {
  const a = express();
  a.use(express.json({ limit: "1kb" }));
  a.use((req: any, _res, next) => {
    if (opts.userId !== undefined) req.userId = opts.userId;
    next();
  });
  a.all("/x", route);
  a.use(notFoundHandler);
  a.use(errorHandler);
  return a;
}

const ok: express.RequestHandler = (_req, res) => void res.json({ ok: true });

beforeEach(() => {
  sentry.captureException.mockClear();
  sentry.withScope.mockClear();
  sentry.scope.setTag.mockClear();
  sentry.scope.setUser.mockClear();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("client errors from the body parser", () => {
  it("malformed JSON is a 400, not reported", async () => {
    const res = await request(app(ok)).post("/x").set("content-type", "application/json").send("{bad");
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/JSON/);
    expect(res.body.errorId).toBeUndefined();
    expect(sentry.captureException).not.toHaveBeenCalled();
  });

  it("an oversized body is a 413, not reported", async () => {
    const res = await request(app(ok))
      .post("/x")
      .set("content-type", "application/json")
      .send(JSON.stringify({ a: "x".repeat(5000) }));
    expect(res.status).toBe(413);
    expect(sentry.captureException).not.toHaveBeenCalled();
  });

  it("an unknown charset is a 415, not reported", async () => {
    const res = await request(app(ok)).post("/x").set("content-type", "application/json; charset=klingon").send("{}");
    expect(res.status).toBe(415);
    expect(sentry.captureException).not.toHaveBeenCalled();
  });

  it("a 4xx whose message is not marked safe keeps its status and hides the message", async () => {
    const res = await request(
      app((_req, _res, next) => next(Object.assign(new Error("internal detail"), { status: 409, expose: false })))
    ).get("/x");
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: "Bad request" });
  });
});

describe("deliberate errors", () => {
  it("HttpError keeps its status and message and is not reported", async () => {
    const res = await request(app((_req, _res, next) => next(new HttpError(403, "Not your league")))).get("/x");
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: "Not your league" });
    expect(sentry.captureException).not.toHaveBeenCalled();
  });

  it("an unclaimed path is a 404", async () => {
    const res = await request(app(ok)).get("/nope");
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "Not found" });
  });
});

describe("unexpected errors", () => {
  it("answer 500 with an id, and report under the same id and the user", async () => {
    const res = await request(app(() => { throw new Error("db exploded"); }, { userId: 42 })).get("/x");
    expect(res.status).toBe(500);
    expect(res.body.errorId).toMatch(/^[0-9a-f]{8}$/);
    expect(sentry.captureException).toHaveBeenCalledOnce();
    expect(sentry.scope.setTag).toHaveBeenCalledWith("errorId", res.body.errorId);
    expect(sentry.scope.setUser).toHaveBeenCalledWith({ id: "42" });
  });

  it("do not set a user for a signed-out caller", async () => {
    await request(app(() => { throw new Error("x"); })).get("/x");
    expect(sentry.scope.setUser).not.toHaveBeenCalled();
  });

  it("hide the detail in production and show it in development", async () => {
    const boom = app(() => { throw new Error("secret internals"); });

    vi.stubEnv("NODE_ENV", "production");
    const prod = await request(boom).get("/x");
    expect(prod.body.detail).toBeUndefined();
    expect(JSON.stringify(prod.body)).not.toContain("secret internals");

    vi.stubEnv("NODE_ENV", "development");
    const dev = await request(boom).get("/x");
    expect(dev.body.detail).toBe("secret internals");
  });

  it("a 5xx carrying its own status is still a reported 500", async () => {
    const res = await request(
      app((_req, _res, next) => next(Object.assign(new Error("upstream"), { status: 503, expose: false })))
    ).get("/x");
    expect(res.status).toBe(500);
    expect(sentry.captureException).toHaveBeenCalledOnce();
  });

  it("a status that is not an integer does not fool the 4xx check", async () => {
    const res = await request(
      app((_req, _res, next) => next(Object.assign(new Error("x"), { status: "400", expose: true })))
    ).get("/x");
    expect(res.status).toBe(500);
  });

  it("a thrown non-Error value is handled", async () => {
    const res = await request(app(() => { throw "a bare string"; })).get("/x");
    expect(res.status).toBe(500);
    expect(sentry.captureException).toHaveBeenCalledWith("a bare string");
  });

  it("an error after the response started is handed to Express, not answered twice", async () => {
    // Express's final handler destroys the socket, so the client sees an abort
    // instead of a second, contradictory response.
    const err = await request(
      app((_req, res, next) => {
        res.status(200).write("partial");
        next(new Error("mid-stream"));
      })
    )
      .get("/x")
      .catch((e) => e);
    expect(err.message).toMatch(/aborted|socket hang up/);
    expect(sentry.captureException).not.toHaveBeenCalled();
  });
});
