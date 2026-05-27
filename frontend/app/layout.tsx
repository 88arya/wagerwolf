import type { Metadata } from "next";
import "./globals.css";
import GoogleProvider from "@/components/GoogleProvider";

export const metadata: Metadata = {
  title: "Playbook",
  description: "NFL prop betting simulation",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" style={{ colorScheme: "light" }}>
      <body suppressHydrationWarning><GoogleProvider>{children}</GoogleProvider></body>
    </html>
  );
}
