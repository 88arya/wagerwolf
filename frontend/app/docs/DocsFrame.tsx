"use client";

import { usePathname } from "next/navigation";
import { EyeOff, FileText, LifeBuoy, ListOrdered, Settings2 } from "lucide-react";
import DocsShell from "@/components/DocsShell";

/**
 * The docs section's chrome — components/DocsShell, the same shell /settings
 * uses. This file is only the rail's contents.
 *
 * EVERYTHING IS INSIDE THE SHELL. This was /legal, and its rail linked OUT of
 * its own section: /terms, /privacy, /responsible-gaming and /how-to-play were
 * top-level routes carrying their own BarePageHeader, so following a rail row
 * dropped the docs chrome and landed on a differently dressed page. All five
 * moved under /docs, which closes that seam — the rail stays put whichever
 * document you are reading.
 *
 * THE RAIL IS TWO DISCLOSURES, not five links. Each section row opens the
 * documents under it, with the same icons their cards carry on /docs, and the
 * section holding the current page is expanded on arrival. Opening one does not
 * close the other; see DocsShell's `open` state.
 *
 * WHICH MEANS NOTHING NAVIGATES TO /docs FROM HERE — a section row is a
 * disclosure, not a link. The shell's title is the way back, via `titleHref`.
 * Before the disclosures, Legal pointed at /docs and counted it as a Legal
 * path, which was right while /docs was the legal index and wrong once it
 * became the index for both groups: the rail claimed you were in Legal on the
 * page that covers everything.
 *
 * /docs is registered in AppChrome's NO_CHROME and FooterSlot's NO_FOOTER, and
 * both match on prefix, so everything under it is bare too.
 *
 * A CLIENT COMPONENT for usePathname, which is why it is not the layout itself:
 * app/docs/layout.tsx is a server component so it can read the theme cookie.
 */

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

/**
 * Which section a route belongs to, for the top bar's location label.
 *
 * Derived from SECTIONS rather than listed again — the rail and the label must
 * never disagree about where you are, and two lists is how they start to.
 */
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
