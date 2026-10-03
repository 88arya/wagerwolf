import { createHash } from "crypto";
import { promisify } from "util";
import { gzip as gzipCb } from "zlib";
import { marketsVersion } from "./weekBoard";

const gzip = promisify(gzipCb);

/**
 * The current-week response, serialized and gzipped once, served as bytes.
 *
 * WHY. Caching the markets (services/weekBoard.ts) took the database out of a
 * board load, but every request still turned 1.56 MB of objects into JSON,
 * Express hashed that string for an ETag, and Caddy gzipped it again. Under the
 * 3 Oct 2026 load test that work, ten-plus times a second on two burstable
 * vCPUs, pinned the event loop; pooled connections were then held for as long
 * as their callbacks sat in the queue, and the pool and Caddy backed up behind
 * it until Caddy was OOM-killed. Serving prebuilt bytes makes a board load
 * close to free.
 *
 * TEN SECONDS. Markets are keyed on `marketsVersion()`, so an odds write or a
 * settlement is visible on the next request, not ten seconds later. The TTL
 * only bounds game rows (score, status) and bet counts, which already lag: the
 * strip polls live scores once a minute and bet counts are cached for 15s.
 *
 * gzip ONLY. Every client of this route sends it (browsers, Cloudflare to the
 * origin, k6). A client that does not gets the identity bytes, also prebuilt.
 * Caddy's `encode` leaves a response that already has a Content-Encoding alone.
 */

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

/**
 * Prebuilt bytes for `key`, rebuilding through `make` when missing, older than
 * the TTL, or built against an older markets version. Concurrent misses share
 * one build.
 */
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
  // Private: it is behind requireAuth. no-cache: revalidate every time, which
  // the ETag makes a 304 when nothing moved.
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
