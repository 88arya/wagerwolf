import type { Metadata } from "next";
import { Fugaz_One, Inter, Inter_Tight } from "next/font/google";
import "./globals.css";
import AppFrame from "@/components/AppFrame";
import { SITE_URL } from "@/lib/siteUrl";
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

// THE LEFT SIDEBAR'S FACE, and nothing else's. Everything under --font-sans is
// Gilroy; .app-sidebar opts out of that and takes this instead, at weight 590.
//
// No `weight` array, so the variable font ships with its 100-900 axis live —
// that is what makes 590 a real interpolated instance rather than a browser
// rounding it to the nearest cut. Pinning weights here would collapse the axis
// to the ones named and 590 would silently become one of them.
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
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

const TITLE = "Fantasy Football Sportsbook | Wagerwolf";
const DESCRIPTION =
  "Fantasy football with sportsbook scoring. Player props, game lines and parlays against your league, on real NFL data with fake money.";

export const metadata: Metadata = {
  // metadataBase is what turns every relative image path below into the
  // absolute URL an unfurler needs. Without it Next warns at build time and
  // ships the OG image as a relative path, which no external site can resolve
  // — so a shared link renders bare no matter how good the tags are.
  metadataBase: new URL(SITE_URL),
  title: TITLE,
  description: DESCRIPTION,
  applicationName: "Wagerwolf",
  openGraph: {
    type: "website",
    siteName: "Wagerwolf",
    title: TITLE,
    description: DESCRIPTION,
    url: SITE_URL,
    images: [{ url: "/opengraph-image", width: 1200, height: 630, alt: "Wagerwolf" }],
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
    images: ["/opengraph-image"],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${interTight.variable} ${inter.variable} ${fugazOne.variable} ${arcaMajora.variable} ${lemonMilk.variable} ${gilroy.variable}`} suppressHydrationWarning>
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
              until someone actually presses the button.

              THE PACKAGE ITSELF IS GONE as of 11 Sept 2026. It sat in
              package.json long after the component was deleted, imported by
              nothing — dead weight in every install and every lockfile audit. */}
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
