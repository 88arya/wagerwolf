/**
 * Landing page — intentionally blank.
 *
 * The hero, the facts strip, the "How it works" section and the Google auth
 * modal were all removed on request to clear the page for a rebuild. The
 * previous version is recoverable in full with:
 *
 *     git show HEAD:frontend/app/page.tsx
 *
 * The chrome around this page is NOT part of it and is still here: AppChrome
 * (the utility bar and the games strip) and SiteFooter are mounted by the root
 * layout and render on every route. On `/` the bar also swaps its lockup for
 * SeasonCountdown. See CLAUDE.md -> Global chrome / Landing chrome.
 *
 * The empty wrapper below is load-bearing. `.app-scroll` is the single scroll
 * region and the footer sits after this content, so a page with no height of
 * its own lets the footer ride up under the games strip instead of sitting
 * below the fold. `flex: 0 0 auto` + `min-height: 100%` is the same contract
 * `.page` / `.page-wide` carry.
 *
 * Sign-in used to live here — this page listened for SIGNUP_EVENT and rendered
 * the Google button. It does not any more: "Play now" in the utility bar routes
 * to /signup, which is a page of its own. Nothing on this blank page is load
 * bearing for auth.
 *
 * Still true, and still worth knowing: /login, /register, /forgot-password and
 * /reset-password are all redirect stubs that bounce here, so this page is
 * where anyone guessing an auth URL lands — and it is blank. /signup is the
 * only real entry point.
 */
import SignedOutOnly from "@/components/SignedOutOnly";

export default function HomePage() {
  return (
    <>
      {/* Signed in, this page has nothing to offer — it is a landing page with
          its content removed. Without this a signed-in visitor sat on a blank
          screen with "My account" in the bar, the chrome saying one thing and
          the page another. */}
      <SignedOutOnly />
      <div style={{ flex: "0 0 auto", minHeight: "100%", background: "var(--bg)" }} />
    </>
  );
}
