import type { Metadata } from "next";
import { Fugaz_One, Inter_Tight } from "next/font/google";
import "./globals.css";
import AppFrame from "@/components/AppFrame";
// The wordmark's face. Declared in wordmarkFonts.ts alongside the other
// candidates and mounted here rather than there, because the lockup appears in
// the utility bar, the footer and /signup — i.e. on every route — so it cannot
// be scoped to one page the way a specimen can.
// arcaMajora is the wordmark's face. lemonMilk had the games strip's team
// abbreviations for four days in August 2026 and no longer has anything —
// the strip is back on Fugaz One below — but it stays mounted because
// wordmarkFonts.ts still lists it as a specimen on /logo.
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
        {/* AppFrame owns the layout, and there are two of them.
            /home, /friends and the league routes get the signed-in shell — a
            sidebar and one card. The landing page and the marketing routes keep
            the older arrangement: AppChrome sticky at the top of .app-scroll,
            with the footer following the content. AppFrame is the single place
            that decides which; see its header for why the split is by route
            rather than by auth state. */}
        {/* GoogleProvider used to wrap this. It mounted @react-oauth/google's
            context and, with it, Google Identity Services' script on every
            route in the app — for one screen's sign-in button. The full-tab
            redirect flow needs neither: lib/googleAuth builds the authorization
            URL itself and the browser navigates. Nothing loads from Google
            until someone actually presses the button. */}
        <AppFrame
          // Passed rather than imported inside AppFrame, which is a client
          // component: SiteFooter is a server component and stays one this
          // way. FooterSlot is the wrapper that lets bare routes opt out.
          footer={
            <FooterSlot>
              <SiteFooter />
            </FooterSlot>
          }
        >
          {children}
        </AppFrame>
      </body>
    </html>
  );
}
