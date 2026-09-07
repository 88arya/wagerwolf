/**
 * The site's own public origin, for the places a relative URL will not do:
 * `metadataBase`, `robots.ts` and `sitemap.ts` all have to emit absolute URLs
 * because they are read by crawlers and by the sites that unfurl a shared link,
 * neither of which has a page to resolve against.
 *
 * `NEXT_PUBLIC_SITE_URL` is read first so that a preview deploy advertises
 * itself rather than production — the alternative is every staging build
 * telling Google it is wagerwolf.app. Vercel supplies `VERCEL_URL` (host only,
 * no scheme) as a fallback, which covers preview builds where nothing was set.
 */
export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ||
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "https://wagerwolf.app");
