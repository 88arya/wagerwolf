import { describe, expect, it } from "vitest";
import { GradeAttempts, GRADE_DEADLINE_MS, backoffMs, pastGradeDeadline } from "../../src/services/gradeRetry";

const MIN = 60_000;
const at = (ms: number) => new Date(Date.UTC(2026, 9, 6, 3, 30) + ms);

describe("pastGradeDeadline", () => {
  const kickoff = at(0);
  it("waits for a finalized event until 12h after kickoff", () => {
    expect(pastGradeDeadline(kickoff, at(GRADE_DEADLINE_MS - 1))).toBe(false);
  });
  it("accepts the event as it stands from 12h on", () => {
    expect(pastGradeDeadline(kickoff, at(GRADE_DEADLINE_MS))).toBe(true);
  });
});

describe("backoffMs", () => {
  it("steps 15, 15, 30, 60, 120, 240 minutes and then holds", () => {
    expect([1, 2, 3, 4, 5, 6, 7, 20].map((n) => backoffMs(n) / MIN))
      .toEqual([15, 15, 30, 60, 120, 240, 240, 240]);
  });

  // The cost ceiling: a feed that never finalizes is fetched at most this many
  // times before the deadline takes over, where one fetch is one billed entity.
  it("caps a never-finalizing game at 7 fetches inside the deadline", () => {
    const a = new GradeAttempts();
    let fetches = 0;
    for (let t = 0; t < GRADE_DEADLINE_MS; t += MIN) {
      if (a.due("g", at(t))) { fetches++; a.record("g", at(t)); }
    }
    expect(fetches).toBe(7);
  });
});

describe("GradeAttempts", () => {
  it("is due on first sight, then not until the backoff has run", () => {
    const a = new GradeAttempts();
    expect(a.due("g", at(0))).toBe(true);
    a.record("g", at(0));
    expect(a.due("g", at(15 * MIN - 1))).toBe(false);
    expect(a.due("g", at(15 * MIN))).toBe(true);
  });

  it("tracks games independently", () => {
    const a = new GradeAttempts();
    a.record("g1", at(0));
    expect(a.due("g2", at(0))).toBe(true);
  });

  it("forgets a game once cleared", () => {
    const a = new GradeAttempts();
    a.record("g", at(0));
    a.clear("g");
    expect(a.due("g", at(1))).toBe(true);
  });
});
