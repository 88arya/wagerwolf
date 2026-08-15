import type { Metadata } from "next";
import { Fugaz_One, Inter_Tight, Poppins } from "next/font/google";
import "./globals.css";
import GoogleProvider from "@/components/GoogleProvider";

const interTight = Inter_Tight({
  subsets: ["latin"],
  variable: "--font-inter-tight",
  display: "swap",
});

// Logo only — the UI stays on Inter Tight. Poppins ships as discrete weights
// rather than a variable font, so the weights have to be named up front; these
// are the three the wordmark might plausibly use.
const poppins = Poppins({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-poppins",
  display: "swap",
});

// Team abbreviations in the games strip only. Fugaz One is a single-face
// display font — weight 400, normal, and nothing else — so both have to be
// named explicitly and neither can be varied.
const fugazOne = Fugaz_One({
  subsets: ["latin"],
  weight: "400",
  style: "normal",
  variable: "--font-fugaz-one",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Wager",
  description: "Fantasy football format, NFL sportsbook scoring",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${interTight.variable} ${poppins.variable} ${fugazOne.variable}`} suppressHydrationWarning>
      <body suppressHydrationWarning>
        <GoogleProvider>{children}</GoogleProvider>
      </body>
    </html>
  );
}
