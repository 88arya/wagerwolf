"use client";

import { usePathname } from "next/navigation";
import { EyeOff, FileText, LifeBuoy, ListOrdered, Settings2 } from "lucide-react";
import DocsShell from "@/components/DocsShell";

const SECTIONS = [
  {
    key: "legal",
    name: "Legal",
    docs: [
      { key: "terms", name: "Terms of Service", href: "/docs/terms-of-service", Icon: FileText },
      { key: "privacy", name: "Privacy Policy", href: "/docs/privacy-policy", Icon: EyeOff },
      { key: "responsible", name: "Responsible Gaming", href: "/docs/responsible-gaming", Icon: LifeBuoy },
    ],
  },
  {
    key: "play",
    name: "Play",
    docs: [
      { key: "how-to-play", name: "How to Play", href: "/docs/how-to-play", Icon: ListOrdered },
      { key: "how-it-works", name: "How It Works", href: "/docs/how-it-works", Icon: Settings2 },
    ],
  },
];

function crumbFor(pathname: string): string {
  const section = SECTIONS.find(s => s.docs.some(d => d.href === pathname));
  // The index belongs to neither group; it is the section's own front page.
  return section?.name ?? "Home";
}

export default function DocsFrame({
  initialDark,
  children,
}: {
  /** The theme the server already knows from the docs_theme cookie. */
  initialDark: boolean;
  children: React.ReactNode;
}) {
  const pathname = usePathname() ?? "";
  return (
    <DocsShell
      title="Docs"
      titleHref="/docs"
      crumb={crumbFor(pathname)}
      done={false}
      theme
      initialDark={initialDark}
      items={SECTIONS.map(({ key, name, docs }) => ({
        key,
        name,
        children: docs.map(d => ({ ...d, active: pathname === d.href })),
      }))}
    >
      {children}
    </DocsShell>
  );
}
