import type { ReactNode } from "react";
import { gilroy } from "../wordmarkFonts";

/**
 * Scopes Gilroy to /signup.
 *
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ LICENSING — RESOLVE BEFORE THIS SHIPS PUBLICLY                          │
 * │                                                                          │
 * │ Gilroy is a COMMERCIAL retail font (© 2016 Radomir Tinkov, sold through  │
 * │ Fontfabric). Only Light and ExtraBold are free; every other weight —     │
 * │ including the three loaded here — is paid, and web-embedding needs a     │
 * │ WEBFONT licence, which is priced separately from desktop.                │
 * │                                                                          │
 * │ The files came from a root-level zip named <hash>-<hash>.zip carrying no │
 * │ licence, EULA or readme, with empty License and License URL fields in    │
 * │ the fonts' own name tables. That is an unlicensed repack, not a purchase.│
 * │                                                                          │
 * │ Serving .woff puts the font file in front of every visitor, which is the │
 * │ most enforced form of font infringement. Buy the webfont licence or swap │
 * │ to a licensed lookalike (Poppins and Manrope are the usual free          │
 * │ geometric stand-ins) before /signup is public.                           │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * The three weights were verified against their own OS/2 tables before being
 * committed — repacked bundles are frequently mislabelled — and read
 * usWeightClass 400 / 500 / 600 as declared.
 *
 * The face itself is declared in app/wordmarkFonts.ts, which is also what
 * /logo reads to render its comparison stack — one declaration, so this page
 * and that one can never be looking at different files.
 *
 * A LAYOUT rather than the page itself because page.tsx is a client component
 * and next/font is a build-time transform that belongs on the server side of
 * the boundary. Per the bundled docs, fonts scope to the component they are
 * applied to, so declaring it here keeps Gilroy off every other route.
 *
 * `display: contents` on the wrapper is load-bearing. app/signup/page.tsx
 * returns a `flex: 1 0 auto; min-height: 100%` box that has to stay a direct
 * flex child of .app-scroll; a wrapper that generated its own box would either
 * break that relationship or nest two full-viewport boxes and double the
 * page height. `contents` removes the box while leaving the element in the
 * inheritance chain, which is all the font variable needs.
 *
 * The lockup at the top of the page is unaffected: WORDMARK_TEXT pins
 * `var(--font-sans)` explicitly, so it stays Inter Tight here as everywhere.
 */

export default function SignupLayout({ children }: { children: ReactNode }) {
  return (
    <div
      className={gilroy.variable}
      style={{ display: "contents", fontFamily: "var(--font-gilroy), var(--font-sans), sans-serif" }}
    >
      {children}
    </div>
  );
}
