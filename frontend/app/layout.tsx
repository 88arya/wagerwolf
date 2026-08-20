import type { Metadata } from "next";
import { Fugaz_One, Inter_Tight } from "next/font/google";
import "./globals.css";
import AppChrome from "@/components/AppChrome";
import GoogleProvider from "@/components/GoogleProvider";
import SiteFooter from "@/components/SiteFooter";

const interTight = Inter_Tight({
  subsets: ["latin"],
  variable: "--font-inter-tight",
  display: "swap",
});

// Team abbreviations in the games strip, and the wordmark. Fugaz One is a
// single-face display font — weight 400, normal, and nothing else — so both
// have to be named explicitly and neither can be varied.
//
// The UI stays on Inter Tight. This is the only exception: Poppins, Lexend
// Deca, Viga, Anton and Passion One each had a turn as a wordmark-only third
// face and each was a separate fetch. Pointing the lockup at the font the games
// strip already loads costs nothing.
const fugazOne = Fugaz_One({
  subsets: ["latin"],
  weight: "400",
  style: "normal",
  variable: "--font-fugaz-one",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Wagerwolf",
  description: "Fantasy football format, NFL sportsbook scoring",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${interTight.variable} ${fugazOne.variable}`} suppressHydrationWarning>
      <body suppressHydrationWarning>
        {/* Utility bar + games strip, global to every signed-in page. Mounted
            here rather than per-layout so navigating between /home and a league
            doesn't tear them down and rebuild them. AppChrome renders a
            fragment, so both stay direct flex children of <body>. */}
        <GoogleProvider>
          <AppChrome />
          {/* The app's single scroll region, holding the page and the footer as
              its two children — that pairing is the whole reason it exists, so
              the footer follows the content instead of pinning to the viewport.
              The chrome above stays outside it and does not scroll. See
              .app-scroll in globals.css. */}
          <div className="app-scroll">
            {children}
            <SiteFooter />
          </div>
        </GoogleProvider>
      </body>
    </html>
  );
}
