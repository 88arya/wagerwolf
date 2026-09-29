import { describe, expect, it } from "vitest";
import { allGamesFinal } from "../../src/services/weekState";

const g = (status: string) => ({ status });

describe("allGamesFinal", () => {
  it("is true when every game is FINAL", () => {
    expect(allGamesFinal([g("FINAL"), g("FINAL"), g("FINAL")])).toBe(true);
  });

  it("waits for a game still to play or in progress", () => {
    expect(allGamesFinal([g("FINAL"), g("SCHEDULED")])).toBe(false);
    expect(allGamesFinal([g("FINAL"), g("LIVE")])).toBe(false);
  });

  // ESPN's POSTPONED arrives as CANCELLED, and resolving refunds it, so a
  // cancelled game leaves the week to its deadline rather than rolling early.
  it("does not roll over a week holding a CANCELLED game", () => {
    expect(allGamesFinal([g("FINAL"), g("CANCELLED")])).toBe(false);
  });

  it("does not treat a week with no games as finished", () => {
    expect(allGamesFinal([])).toBe(false);
  });
});
