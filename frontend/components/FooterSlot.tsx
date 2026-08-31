"use client";

import { usePathname } from "next/navigation";

/**
 * Hides the site footer on the routes that are meant to be nothing but
 * themselves.
 *
 * The footer is mounted unconditionally by the root layout and, per the note in
 * SiteFooter, renders on every route by design — the landing page included.
 * This is the first exception, and it is a deliberate one rather than an
 * oversight: the bare routes are screens with their own wordmark header, and
 * a dark four-column footer under one of them (reachable by scrolling, since
 * the page is a full viewport tall) belongs to a different design.
 *
 * NOTE the legal pages are linked FROM the footer, so suppressing it there also
 * stops the page you arrived at offering you the link you just followed.
 *
 * SiteFooter is a SERVER component — a list of links and a sentence, with
 * nothing to run on the client — so it cannot read the pathname itself. Passing
 * it through as `children` keeps it server-rendered while this client wrapper
 * decides whether to show it.
 *
 * Kept separate from AppChrome's NO_CHROME on purpose. That list also holds
 * /logo, which still WANTS the footer; folding the two
 * together would silently change those two routes as well.
 */
const NO_FOOTER = ["/signup", "/sign-in", "/settings", "/docs"];

export default function FooterSlot({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? "";
  const hidden = NO_FOOTER.some(p => pathname === p || pathname.startsWith(`${p}/`));
  if (hidden) return null;
  return <>{children}</>;
}
