import Link from "next/link";
import SupportLink from "@/components/SupportLink";
import type { SupportTopic } from "@/lib/support";
import Logo from "@/components/Logo";

const COLUMNS: Array<{
  heading: string;
  links: Array<{ label: string; href?: string; support?: SupportTopic }>;
}> = [
  {
    heading: "Legal",
    links: [
      { label: "Terms of Service", href: "/docs/terms-of-service" },
      { label: "Privacy Policy", href: "/docs/privacy-policy" },
      { label: "Responsible Gaming", href: "/docs/responsible-gaming" },
    ],
  },
  {
    heading: "Play",
    links: [
      { label: "How to Play", href: "/docs/how-to-play" },
      { label: "How It Works", href: "/docs/how-it-works" },
    ],
  },
  {
    heading: "Support",
    links: [
      { label: "Contact Us", support: "contact" },
    ],
  },
];

function FooterLink({ label, href, support }: { label: string; href?: string; support?: SupportTopic }) {
  if (support) {
    return <SupportLink className="site-footer-link" topic={support}>{label}</SupportLink>;
  }
  return (
    <Link
      href={href!}
      className="site-footer-link"
      target="_blank"
      rel="noopener noreferrer"
    >
      {label}
    </Link>
  );
}

export default function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="site-footer-cols">
        {COLUMNS.map(({ heading, links }) => (
          <div key={heading}>
            <div className="site-footer-heading">{heading}</div>
            <div className="site-footer-links">
              {links.map((link) => <FooterLink key={link.label} {...link} />)}
            </div>
          </div>
        ))}
      </div>

      <div className="site-footer-rule">
        <Logo size={78} bare />
        <p className="site-footer-fine">© {new Date().getFullYear()} Wagerwolf</p>
      </div>
    </footer>
  );
}
