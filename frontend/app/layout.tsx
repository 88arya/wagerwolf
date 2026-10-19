import type { Metadata } from "next";
import { Fugaz_One, Inter, Inter_Tight } from "next/font/google";
import "./globals.css";
import AppFrame from "@/components/AppFrame";
import { SITE_URL } from "@/lib/siteUrl";
import { arcaMajora, gilroy, lemonMilk } from "./wordmarkFonts";
import SiteFooter from "@/components/SiteFooter";
import FooterSlot from "@/components/FooterSlot";

const interTight = Inter_Tight({
  subsets: ["latin"],
  variable: "--font-inter-tight",
  display: "swap",
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

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
        <AppFrame
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
