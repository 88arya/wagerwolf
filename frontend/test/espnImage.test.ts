import { describe, expect, it } from "vitest";
import { headshotUrl, sizedHeadshot, teamLogoResized } from "../lib/espnImage";
import { getTeamLogoUrl } from "../lib/teamLogos";

const COMBINER = "https://a.espncdn.com/combiner/i?img=";

describe("headshotUrl", () => {
  it("sizes for 2x the drawn width, keeping ESPN's 600x436 aspect", () => {
    expect(headshotUrl("15864", 54)).toBe(`${COMBINER}/i/headshots/nfl/players/full/15864.png&w=108&h=78`);
  });

  it("never asks for more than the original", () => {
    expect(headshotUrl("1", 1000)).toContain("&w=600&h=436");
  });

  it("rounds a fractional width up", () => {
    expect(headshotUrl("1", 40.2)).toContain("&w=81&");
  });
});

describe("sizedHeadshot", () => {
  it("resizes a full-size headshot URL", () => {
    const full = "https://a.espncdn.com/i/headshots/nfl/players/full/3916387.png";
    expect(sizedHeadshot(full, 72)).toBe(headshotUrl("3916387", 72));
  });

  it("passes any other URL through", () => {
    const other = "https://example.com/p.png";
    expect(sizedHeadshot(other, 72)).toBe(other);
  });
});

describe("team logos", () => {
  it("keeps the 500px original when no size is given", () => {
    expect(getTeamLogoUrl("KC")).toBe("https://a.espncdn.com/i/teamlogos/nfl/500/kc.png");
  });

  it("resizes square at 2x when a size is given", () => {
    expect(getTeamLogoUrl("KC", 20)).toBe(teamLogoResized("kc", 20));
    expect(teamLogoResized("kc", 20)).toBe(`${COMBINER}/i/teamlogos/nfl/500/kc.png&w=40&h=40`);
  });

  it("caps at the original's 500px", () => {
    expect(teamLogoResized("kc", 400)).toContain("&w=500&h=500");
  });

  it("returns null for an unknown team either way", () => {
    expect(getTeamLogoUrl("zzz", 20)).toBeNull();
  });
});
