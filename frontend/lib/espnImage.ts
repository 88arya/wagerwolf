// ESPN's originals are large: a headshot is a 600x436 PNG (~250KB) and a team
// logo a 500px PNG (~40KB), drawn here at 20-72 CSS px. The combiner endpoint
// resizes on ESPN's side and keeps the alpha channel; a 108px headshot is ~13KB.
// It has no WebP output (format=webp answers 400), so PNG it stays.
const CDN = "https://a.espncdn.com";

// 2x, which is also what Lighthouse sizes against. 3x phones draw these
// 20-72px images a touch soft; at 3x the files were judged 58% oversized.
const DPR = 2;

const HEADSHOT_W = 600;
const HEADSHOT_H = 436;

export function espnResized(path: string, w: number, h: number): string {
  return `${CDN}/combiner/i?img=${path}&w=${w}&h=${h}`;
}

/** cssWidth is the width the photo is actually drawn at, after any zoom. */
export function headshotUrl(espnId: string, cssWidth: number): string {
  const w = Math.min(HEADSHOT_W, Math.ceil(cssWidth * DPR));
  const h = Math.round((w * HEADSHOT_H) / HEADSHOT_W);
  return espnResized(`/i/headshots/nfl/players/full/${espnId}.png`, w, h);
}

export function teamLogoPath(abbr: string): string {
  return `/i/teamlogos/nfl/500/${abbr}.png`;
}

export function teamLogoResized(abbr: string, cssSize: number): string {
  const px = Math.min(500, Math.ceil(cssSize * DPR));
  return espnResized(teamLogoPath(abbr), px, px);
}

const FULL_HEADSHOT = /\/i\/headshots\/nfl\/players\/full\/(\d+)\.png$/;

/** Resizes a full-size ESPN headshot URL (as GET /players/:id/image returns); anything else passes through. */
export function sizedHeadshot(url: string, cssWidth: number): string {
  const m = FULL_HEADSHOT.exec(url);
  return m ? headshotUrl(m[1], cssWidth) : url;
}
