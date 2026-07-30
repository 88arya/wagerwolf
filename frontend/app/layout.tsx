import type { Metadata } from "next";
import { Inter_Tight } from "next/font/google";
import "./globals.css";
import GoogleProvider from "@/components/GoogleProvider";

const interTight = Inter_Tight({
  subsets: ["latin"],
  variable: "--font-inter-tight",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Wager",
  description: "Fantasy football format, NFL sportsbook scoring",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={interTight.variable} suppressHydrationWarning>
      <body suppressHydrationWarning>
        <GoogleProvider>{children}</GoogleProvider>
      </body>
    </html>
  );
}
