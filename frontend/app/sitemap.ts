/**
 * The public surface, listed for crawlers.
 *
 * Static by design: every signed-in route is per-user or per-league and belongs
 * in neither a sitemap nor a search index (robots.ts disallows them). What is
 * left is the landing page, the way in, support, and the five documents under
 * /docs — which are the pages most likely to be linked to from outside.
 *
 * The /terms, /privacy and similar stubs are deliberately absent: they are 308
 * redirects to their /docs addresses, and listing both spellings asks a crawler
 * to index the same document twice.
 */
import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/siteUrl";

const ROUTES = [
  { path: "", priority: 1 },
  { path: "/signup", priority: 0.8 },
  { path: "/docs", priority: 0.6 },
  { path: "/docs/how-to-play", priority: 0.6 },
  { path: "/docs/how-it-works", priority: 0.6 },
  { path: "/docs/terms-of-service", priority: 0.3 },
  { path: "/docs/privacy-policy", priority: 0.3 },
  { path: "/docs/responsible-gaming", priority: 0.3 },
  { path: "/contact", priority: 0.4 },
];

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();
  return ROUTES.map(({ path, priority }) => ({
    url: `${SITE_URL}${path}`,
    lastModified,
    changeFrequency: "monthly" as const,
    priority,
  }));
}
