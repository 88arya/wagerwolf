import { describe, expect, it, vi } from "vitest";
import { MAX_NAMED_STEPS, runJob, StepsFailed, type Handler } from "../../src/services/jobRunner";

const deps = () => ({ report: vi.fn(), heartbeat: vi.fn().mockResolvedValue(undefined) });

describe("runJob", () => {
  it("a clean run pings success and reports nothing", async () => {
    const d = deps();
    await runJob("score-sync", { "score-sync": async () => {} }, d);
    expect(d.heartbeat).toHaveBeenCalledWith("score-sync", true);
    expect(d.report).not.toHaveBeenCalled();
  });

  it("runs every step, reports each failure, then fails the job", async () => {
    const d = deps();
    const ran: string[] = [];
    const handler: Handler = async (fail) => {
      for (const league of ["a", "b", "c"]) {
        ran.push(league);
        if (league !== "b") fail(`auto-start league ${league}`, new Error(`league ${league} broke`));
      }
    };

    const err = await runJob("espn-game-sync", { "espn-game-sync": handler }, d).catch((e) => e);

    expect(ran).toEqual(["a", "b", "c"]); // isolation kept: a failure did not stop the loop
    expect(err).toBeInstanceOf(StepsFailed);
    expect(err.steps).toEqual(["auto-start league a", "auto-start league c"]);
    expect(err.message).toBe(
      "espn-game-sync: 2 step(s) failed: auto-start league a; auto-start league c"
    );
    expect(d.report).toHaveBeenCalledTimes(2);
    expect(d.report).toHaveBeenCalledWith(
      "[cron] espn-game-sync: auto-start league a failed:",
      expect.any(Error),
      { job: "espn-game-sync", step: "auto-start league a" }
    );
    expect(d.heartbeat).toHaveBeenCalledWith("espn-game-sync", false);
  });

  it("counts a throw that escapes the handler as a failed step", async () => {
    const d = deps();
    const boom = new Error("db down");
    const err = await runJob("odds-poll", { "odds-poll": async () => { throw boom; } }, d).catch((e) => e);
    expect(err).toBeInstanceOf(StepsFailed);
    expect(err.steps).toEqual(["job"]);
    expect(d.report).toHaveBeenCalledWith("[cron] odds-poll: job failed:", boom, { job: "odds-poll", step: "job" });
    expect(d.heartbeat).toHaveBeenCalledWith("odds-poll", false);
  });

  it("keeps steps reported before the handler threw", async () => {
    const d = deps();
    const err = await runJob(
      "x",
      { x: async (fail) => { fail("first", new Error("1")); throw new Error("2"); } },
      d
    ).catch((e) => e);
    expect(err.steps).toEqual(["first", "job"]);
  });

  it("a rejection with a non-Error value is still a failure", async () => {
    const d = deps();
    const err = await runJob("x", { x: () => Promise.reject("just a string") }, d).catch((e) => e);
    expect(err).toBeInstanceOf(StepsFailed);
    expect(d.report).toHaveBeenCalledWith("[cron] x: job failed:", "just a string", { job: "x", step: "job" });
  });

  it("names at most MAX_NAMED_STEPS steps in the message and counts the rest", async () => {
    const d = deps();
    const handler: Handler = async (fail) => {
      for (let i = 1; i <= 250; i++) fail(`league ${i}`, new Error("x"));
    };
    const err = await runJob("x", { x: handler }, d).catch((e) => e);
    expect(err.steps).toHaveLength(250);
    expect(err.message).toMatch(/^x: 250 step\(s\) failed: league 1; .*; league 10; and 240 more$/);
    expect(err.message.split(";")).toHaveLength(MAX_NAMED_STEPS + 1);
    expect(d.report).toHaveBeenCalledTimes(250);
  });

  it("an unknown job is logged, not failed, and pings nothing", async () => {
    const d = deps();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await expect(runJob("odds-sync", {}, d)).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledWith('[cron] No handler registered for job "odds-sync"');
    expect(d.heartbeat).not.toHaveBeenCalled();
  });

  it.each(["constructor", "toString", "__proto__", "hasOwnProperty"])(
    "does not mistake %s on the prototype for a handler",
    async (name) => {
      const d = deps();
      vi.spyOn(console, "warn").mockImplementation(() => {});
      await expect(runJob(name, { "score-sync": async () => {} }, d)).resolves.toBeUndefined();
      expect(d.heartbeat).not.toHaveBeenCalled();
    }
  );
});
