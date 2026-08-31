import type { Metadata } from "next";
import Link from "next/link";
import { EyeOff, FileText, LifeBuoy, ListOrdered, Settings2 } from "lucide-react";

// The index for all five documents, in two groups.
//
// It carries no copy of its own beyond the blurbs — everything binding lives in
// the pages it points at, so there is nothing here to fall out of step with
// them. That mattered most while this was the LEGAL index and is worth keeping
// now that it is the whole section's.
//
// GROUPS RATHER THAN ONE GRID OF FIVE. Play and Legal are read for opposite
// reasons — one before you start, one when something has gone wrong or you want
// to know what you agreed to — and five undifferentiated cards made the reader
// sort them out. The headings do that work instead.
//
// LEGAL IS FIRST, matching the rail. The order was Play-first on the argument
// that a newcomer wants the walkthrough more than the Terms — true, but it put
// the page and the nav beside it in different orders, and a reader who has just
// used the rail to get here reads the two as one list. Agreeing with the nav
// beats the argument about which document is wanted more.

export const metadata: Metadata = {
  // "Wagerwolf Docs", not "Docs — Wagerwolf". The dashed form is for a page
  // INSIDE a product — the documents below still use it — but this is the
  // section's front door, and a tab reading "Docs —" tells you nothing until
  // you have read to the end of it.
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
        blurb: "What we store about you, who sees it, and how to have it deleted.",
        Icon: EyeOff,
      },
      {
        href: "/docs/responsible-gaming",
        name: "Responsible Gaming",
        blurb: "Nothing here is real money, and where to get help if betting is a problem elsewhere.",
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
        blurb: "The eight-step walkthrough, from joining a league to winning a matchup.",
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
      {/* NO PAGE TITLE AND NO LEDE. The bar above already says Docs, and the
          two group headings say what is here more precisely than one line
          spanning both could. */}
      {GROUPS.map(({ key, title, docs }) => (
        <section key={key} className="legal-group">
          <h2 className="legal-group-title">{title}</h2>
          {/* The grid stays 3-up in both groups rather than fitting its own
              count, so a Play card and a Legal card are the same object at the
              same size. Play's two simply leave the third column empty. */}
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
