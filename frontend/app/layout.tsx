import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Playbook",
  description: "NFL prop betting simulation",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
