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
