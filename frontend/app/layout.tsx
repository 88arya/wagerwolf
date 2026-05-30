import type { Metadata } from "next";
import "./globals.css";
import GoogleProvider from "@/components/GoogleProvider";

export const metadata: Metadata = {
  title: "FanMark",
  description: "Fantasy football format, NFL sportsbook scoring",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" style={{ colorScheme: "dark" }}>
      <body suppressHydrationWarning><GoogleProvider>{children}</GoogleProvider></body>
    </html>
  );
}
