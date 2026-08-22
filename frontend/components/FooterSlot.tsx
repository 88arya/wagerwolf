"use client";

import { usePathname } from "next/navigation";

/**
 * Hides the site footer on the routes that are meant to be nothing but
 * themselves.
 *
 * The footer is mounted unconditionally by the root layout and, per the note in
 * SiteFooter, renders on every route by design — the landing page included.
 * This is the first exception, and it is a deliberate one rather than an
 * oversight: /signup is a bare screen with its own wordmark and a single
 * column, and a dark four-column footer under it (reachable by scrolling, since
 * the page is a full viewport tall) belongs to a different design.
 *
 * SiteFooter is a SERVER component — a list of links and a sentence, with
 * nothing to run on the client — so it cannot read the pathname itself. Passing
 * it through as `children` keeps it server-rendered while this client wrapper
 * decides whether to show it.
 *
 * Kept separate from AppChrome's NO_CHROME on purpose. That list also holds
 * /onboarding and /logo, both of which still WANT the footer; folding the two
 * together would silently change those two routes as well.
 */
const NO_FOOTER = ["/signup"];

export default function FooterSlot({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? "";
  const hidden = NO_FOOTER.some(p => pathname === p || pathname.startsWith(`${p}/`));
  if (hidden) return null;
  return <>{children}</>;
}
