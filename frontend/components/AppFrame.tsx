"use client";

import { usePathname } from "next/navigation";
import AppChrome from "@/components/AppChrome";
import MobileGate from "@/components/MobileGate";
import SideNav from "@/components/SideNav";

/**
 * Chooses between the app's two layouts, and is the only place that choice is
 * made.
 *
 * THE SHELL — a sidebar and one card, `.app-shell` in globals.css. This is the
 * signed-in app: /home, /friends and every league route. The card is the scroll
 * region and holds the whole page; there is no utility bar, no SiteNav, no
 * games strip and no site footer above or below it.
 *
 * THE CLASSIC LAYOUT — `.app-scroll` with AppChrome pinned at its top and the
 * footer at its foot. This is the landing page and the marketing routes, and it
 * is UNCHANGED. That is the point of splitting here rather than teaching the
 * existing chrome to hide itself: `/` keeps exactly the layout it had.
 *
 * WHY THE SPLIT IS BY ROUTE AND NOT BY `authed`
 *
 * The two layouts are structurally different — different scroller, different
 * ground, different everything — so a component that swapped between them when
 * the token check landed would rebuild the page one frame in, on every load.
 * `useAuthed()` is null until an effect runs on the client (see lib/auth), and
 * there is no way to know during SSR.
 *
 * Route is a better proxy anyway, because these routes are already guarded:
 * app/(user)/layout.tsx bounces anyone without a token, and the league routes
 * sit behind LobbyGate. Someone signed out who reaches one gets the shell for
 * the moment before the guard redirects them, which is the same moment they
 * used to get a signed-in-looking chrome for.
 *
 * SHELL_ROUTES is therefore a list of routes and NOT "everything that is not
 * public". /settings, /signup, /sign-in and the legal pages are signed-in or
 * auth routes that stay OUT of it: each is a `.bare-route`, a self-contained
 * sheet with its own header and a Done button, and wrapping a sheet in a shell
 * would give it two ways back.
 *
 * BUT: an allowlist means a NEW SIDEBAR ROW MUST BE ADDED HERE TOO. Miss it and
 * the route still works, so nothing errors — it just falls through to the
 * classic branch and comes back wearing AppChrome, so the page renders with the
 * utility bar and the rotating games strip above it while every other row in
 * the same sidebar section does not. /inbox shipped that way and it reads as
 * the strip having leaked onto one page rather than as a missing list entry,
 * which is why it is called out here rather than left to be rediscovered.
 */
const SHELL_ROUTES = ["/home", "/leagues"];

function inShell(pathname: string) {
  return SHELL_ROUTES.some(p => pathname === p || pathname.startsWith(`${p}/`));
}

export default function AppFrame({
  children,
  footer,
}: {
  children: React.ReactNode;
  // Passed in rather than imported: SiteFooter is a server component, and the
  // root layout is where it can stay one. Same reason FooterSlot takes it as
  // children.
  footer: React.ReactNode;
}) {
  const pathname = usePathname() ?? "";

  if (inShell(pathname)) {
    return (
      <>
      {/* THE SHELL IS DESKTOP ONLY. Both of these render on every shell route
          and CSS picks one — see MobileGate's header for why the choice is a
          media query rather than a width read in an effect. The classic branch
          below gets no gate: the landing page and the marketing routes are
          responsive and stay that way. */}
      <MobileGate />
      <div className="app-shell">
        <SideNav />
        {/* THE CARD IS THE SCROLLER. Pages inside it need no changes: `.page` /
            `.page-wide` resolve their `min-height: calc(100% - var(--chrome-h))`
            against this box, and --chrome-h is the :root default of 0 because
            AppChrome is not mounted on this branch at all.

            No footer. The shell is the nav and the card, so the legal links
            live on the marketing routes, which still carry it. */}
        <div className="app-card">{children}</div>
      </div>
      </>
    );
  }

  return (
    // The app's other scroll region, and the older one. See the .app-scroll
    // note in globals.css: the chrome is INSIDE it and sticky, so the whole
    // viewport is one scrollport and a wheel event over the bar still scrolls
    // the page.
    <div className="app-scroll">
      <AppChrome />
      {children}
      {footer}
    </div>
  );
}
