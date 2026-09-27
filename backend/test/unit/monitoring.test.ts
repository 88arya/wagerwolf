import { beforeEach, describe, expect, it, vi } from "vitest";

const sentry = vi.hoisted(() => ({ captureException: vi.fn(), captureMessage: vi.fn() }));
vi.mock("@sentry/node", () => sentry);

import { reportCondition, reportError } from "../../src/lib/monitoring";

beforeEach(() => {
  sentry.captureException.mockClear();
  sentry.captureMessage.mockClear();
});

describe("reportError", () => {
  it("logs and reports, dropping undefined tags and stringifying the rest", () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const err = new Error("x");
    reportError("[cron] label", err, { job: "score-sync", week: 3, league: undefined });
    expect(log).toHaveBeenCalledWith("[cron] label", err);
    expect(sentry.captureException).toHaveBeenCalledWith(err, { tags: { job: "score-sync", week: "3" } });
  });

  it("accepts values that are not Errors", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => reportError("label", undefined)).not.toThrow();
    expect(sentry.captureException).toHaveBeenCalledWith(undefined, { tags: {} });
  });
});

describe("reportCondition", () => {
  it("is a warning grouped by its fingerprint, so an hourly repeat is one issue", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    reportCondition("[cron] STUCK: week 3 ... 27h", ["cron-stuck-week", "3"], { week: 3 });
    reportCondition("[cron] STUCK: week 3 ... 28h", ["cron-stuck-week", "3"], { week: 3 });
    for (const call of sentry.captureMessage.mock.calls) {
      expect(call[1]).toEqual({ level: "warning", fingerprint: ["cron-stuck-week", "3"], tags: { week: "3" } });
    }
    expect(sentry.captureMessage).toHaveBeenCalledTimes(2);
  });
});
