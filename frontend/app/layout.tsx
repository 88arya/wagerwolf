import type { Metadata } from "next";
import { Inter_Tight, Poppins } from "next/font/google";
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

export const metadata: Metadata = {
  title: "Wager",
  description: "Fantasy football format, NFL sportsbook scoring",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${interTight.variable} ${poppins.variable}`} suppressHydrationWarning>
      <body suppressHydrationWarning>
        <GoogleProvider>{children}</GoogleProvider>
      </body>
    </html>
  );
}
