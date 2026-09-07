/**
 * What crawlers may index.
 *
 * Everything behind sign-in is disallowed. Not as a security measure — those
 * routes require a token and a crawler has none, so it would get a redirect
 * anyway — but because a search result pointing at /leagues/<id> or /settings
 * is a dead link for whoever clicks it. The marketing routes and the docs are
 * the only pages that mean anything to a visitor arriving cold.
 */
import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/siteUrl";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/home", "/leagues/", "/settings", "/friends", "/leaderboard", "/auth/", "/api/"],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
