import type { Metadata } from "next";
import { Fugaz_One, Inter_Tight } from "next/font/google";
import "./globals.css";
import AppChrome from "@/components/AppChrome";
import GoogleProvider from "@/components/GoogleProvider";
// The wordmark's face. Declared in wordmarkFonts.ts alongside the other
// candidates and mounted here rather than there, because the lockup appears in
// the utility bar, the footer and /signup — i.e. on every route — so it cannot
// be scoped to one page the way a specimen can.
// arcaMajora is the wordmark's face; lemonMilk sets the games strip's team
// abbreviations. Both declared in wordmarkFonts.ts and mounted here because
// both appear on every route.
import { arcaMajora, gilroy, lemonMilk } from "./wordmarkFonts";
import SiteFooter from "@/components/SiteFooter";
import FooterSlot from "@/components/FooterSlot";

const interTight = Inter_Tight({
  subsets: ["latin"],
  variable: "--font-inter-tight",
  display: "swap",
});

// Team abbreviations in the games strip, and nothing else now. Fugaz One is a
// single-face display font — weight 400, normal, and nothing else — so both
// have to be named explicitly and neither can be varied.
//
// The wordmark used to share it, which was the argument for keeping a third
// face at all: Poppins, Lexend Deca, Viga, Anton and Passion One each had a
// turn as a wordmark-only face and each was its own fetch, so pointing the
// lockup at the font the strip already loaded cost nothing. The lockup is on
// Inter Tight now, so that argument is gone and this face is carried for the
// strip alone.
const fugazOne = Fugaz_One({
  subsets: ["latin"],
  weight: "400",
  style: "normal",
  variable: "--font-fugaz-one",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Fantasy Football Sportsbook | Wagerwolf",
  description: "Fantasy football format, NFL sportsbook scoring",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${interTight.variable} ${fugazOne.variable} ${arcaMajora.variable} ${lemonMilk.variable} ${gilroy.variable}`} suppressHydrationWarning>
      <body suppressHydrationWarning>
        {/* Utility bar + games strip, global to every signed-in page. Mounted
            here rather than per-layout so navigating between /home and a league
            doesn't tear them down and rebuild them. AppChrome renders a
            fragment, so both stay direct flex children of <body>. */}
        <GoogleProvider>
          {/* The app's single scroll region — and it now genuinely is single.
              The chrome used to sit outside it as a <body> sibling, which meant
              a wheel event over the utility bar or the games strip had no
              scrollable ancestor to move: the page simply did not respond, and
              the scrollbar began below the strip rather than spanning the
              window, which is what made the header read as detached from the
              page under it.

              Inside, and pinned with `position: sticky` (see .app-chrome), it
              stays exactly as visible while the whole viewport becomes one
              scrollport. The footer still follows the content rather than
              pinning, since it is still the last child here. */}
          <div className="app-scroll">
            <AppChrome />
            {children}
            {/* Wrapped so /signup can opt out — see FooterSlot. SiteFooter is
                a server component and cannot read the pathname itself, so it is
                passed through as children rather than made a client one. */}
            <FooterSlot>
              <SiteFooter />
            </FooterSlot>
          </div>
        </GoogleProvider>
      </body>
    </html>
  );
}
