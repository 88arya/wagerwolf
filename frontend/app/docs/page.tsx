import type { Metadata } from "next";
import Link from "next/link";
import { EyeOff, FileText, LifeBuoy, ListOrdered, Settings2 } from "lucide-react";

export const metadata: Metadata = {
  title: "Wagerwolf Docs",
  description: "How to play Wagerwolf, how it works underneath, and the terms that govern using it.",
};

const GROUPS: Array<{
  key: string;
  title: string;
  docs: Array<{ href: string; name: string; blurb: string; Icon: typeof FileText }>;
}> = [
  {
    key: "legal",
    title: "Legal",
    docs: [
      {
        href: "/docs/terms-of-service",
        name: "Terms of Service",
        blurb: "What you agree to by creating an account: 18+, fair play, and no real money.",
        Icon: FileText,
      },
      {
        href: "/docs/privacy-policy",
        name: "Privacy Policy",
        blurb: "What we store about you, who sees it, how long we keep it, and how to have it exported or deleted.",
        Icon: EyeOff,
      },
      {
        href: "/docs/responsible-gaming",
        name: "Responsible Gaming",
        blurb: "No real money, no deposits, no payouts. Signs worth watching for, and where to get help.",
        Icon: LifeBuoy,
      },
    ],
  },
  {
    key: "play",
    title: "Play",
    docs: [
      {
        href: "/docs/how-to-play",
        name: "How to Play",
        blurb: "The ten-step walkthrough, from joining a league to winning a matchup.",
        Icon: ListOrdered,
      },
      {
        href: "/docs/how-it-works",
        name: "How It Works",
        blurb: "How bets are graded, when a stake comes back, and where the odds come from.",
        Icon: Settings2,
      },
    ],
  },
];

export default function DocsPage() {
  return (
    <>
      {GROUPS.map(({ key, title, docs }) => (
        <section key={key} className="legal-group">
          <h2 className="legal-group-title">{title}</h2>
          <div className="legal-cards">
            {docs.map(({ href, name, blurb, Icon }) => (
              <Link key={href} href={href} className="legal-card">
                <span className="legal-card-top">
                  <Icon size={18} strokeWidth={1.75} aria-hidden="true" />
                </span>
                <span className="legal-card-body">
                  <span className="legal-card-name">{name}</span>
                  <span className="legal-card-blurb">{blurb}</span>
                </span>
              </Link>
            ))}
          </div>
        </section>
      ))}
    </>
  );
}
