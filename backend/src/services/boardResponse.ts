import { createHash } from "crypto";
import { promisify } from "util";
import { gzip as gzipCb } from "zlib";
import { marketsVersion } from "./weekBoard";

// Current-week response serialized and gzipped once, served as bytes.
// Serializing ~1.5 MB per request was pinning the CPU under load.
// Rebuilt when the TTL expires or the markets version changes.

const gzip = promisify(gzipCb);

const TTL_MS = 10_000;

export type BuiltResponse = { json: Buffer; gz: Buffer; etag: string; at: number };

const cache = new Map<string, BuiltResponse>();
const inflight = new Map<string, Promise<BuiltResponse>>();

async function build(body: unknown): Promise<BuiltResponse> {
  const json = Buffer.from(JSON.stringify(body));
  const gz = await gzip(json);
  const etag = `W/"${createHash("sha1").update(json).digest("base64url")}"`;
  return { json, gz, etag, at: Date.now() };
}

export async function cachedResponse(key: string, make: () => Promise<unknown>): Promise<BuiltResponse> {
  const k = `${key}@${marketsVersion()}`;
  const hit = cache.get(k);
  if (hit && Date.now() - hit.at <= TTL_MS) return hit;

  let p = inflight.get(k);
  if (!p) {
    p = make()
      .then(build)
      .then((b) => {
        // Drop anything stale on the way in, so dead versions do not pile up.
        for (const [ck, cv] of cache) if (Date.now() - cv.at > TTL_MS || !ck.endsWith(`@${marketsVersion()}`)) cache.delete(ck);
        cache.set(k, b);
        return b;
      })
      .finally(() => inflight.delete(k));
    inflight.set(k, p);
  }
  return p;
}

const stripWeak = (t: string) => t.replace(/^W\//, "");

export function sendBuilt(req: any, res: any, b: BuiltResponse): void {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("ETag", b.etag);
  res.setHeader("Vary", "Accept-Encoding");
  res.setHeader("Cache-Control", "private, no-cache");

  const inm = req.headers["if-none-match"];
  if (typeof inm === "string" && inm.split(",").some((t) => stripWeak(t.trim()) === stripWeak(b.etag))) {
    res.status(304).end();
    return;
  }
  if (/\bgzip\b/.test(String(req.headers["accept-encoding"] ?? ""))) {
    res.setHeader("Content-Encoding", "gzip");
    res.end(b.gz);
  } else {
    res.end(b.json);
  }
}

/** Test seam. */
export function _resetBoardResponses(): void {
  cache.clear();
  inflight.clear();
}
