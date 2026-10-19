"use client";

import { useState } from "react";
import type { ComponentType } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronRight, Moon, Sun } from "lucide-react";
import Logo from "@/components/Logo";
import SupportModal from "@/components/SupportModal";
import { writeDocsTheme } from "@/lib/docsTheme";

// Shared by /docs and /settings. Check both when changing it.
export type DocsNavItem = {
  key: string;
  name: string;
  /** A route. Mutually exclusive with onSelect and children. */
  href?: string;
  /** Local state. Mutually exclusive with href and children. */
  onSelect?: () => void;
  active?: boolean;
  /** The mark beside the name. Rendered on child rows; sections take none. */
  Icon?: ComponentType<{ size?: number; strokeWidth?: number }>;
  children?: DocsNavItem[];
};

export default function DocsShell({
  title,
  items,
  titleHref,
  crumb,
  done = true,
  theme = false,
  initialDark = true,
  children,
}: {
  title: string;
  items: DocsNavItem[];
  /** Where the title links. Omitted leaves it plain text - see the render. */
  titleHref?: string;
  crumb?: string;
  done?: boolean;
  theme?: boolean;
  initialDark?: boolean;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [support, setSupport] = useState(false);
  // Seeded from the server's cookie read; never corrected after mount.
  const [dark, setDark] = useState(initialDark);
  const [open, setOpen] = useState<string[]>(() =>
    items.filter(i => i.children?.some(c => c.active)).map(i => i.key),
  );

  function toggleTheme() {
    const v = !dark;
    setDark(v);
    writeDocsTheme(v);
  }

  return (
    <div className={`docs-shell${theme && dark ? " is-dark" : ""}`}>
      <header className="docs-topbar">
        <div className="docs-brand">
          <Link href="/" aria-label="Wagerwolf home" className="docs-brand-mark">
            <Logo size={28} bare />
          </Link>
          <span className="docs-brand-rule" aria-hidden="true" />
          {titleHref ? (
            <Link href={titleHref} className="docs-brand-name is-link">{title}</Link>
          ) : (
            <span className="docs-brand-name">{title}</span>
          )}
        </div>

        <div className="docs-topbar-main">
          {crumb && <span className="docs-crumb">{crumb}</span>}
          {theme && (
            <button
              type="button"
              className="docs-theme"
              onClick={toggleTheme}
              aria-pressed={dark}
              aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
              title={dark ? "Light mode" : "Dark mode"}
            >
              {dark
                ? <Sun size={16} strokeWidth={1.75} aria-hidden="true" />
                : <Moon size={16} strokeWidth={1.75} aria-hidden="true" />}
            </button>
          )}
          <button type="button" className="docs-support" onClick={() => setSupport(true)}>
            Contact Support
          </button>
          {done && (
            <button type="button" className="bare-done" onClick={() => router.back()}>
              Done
            </button>
          )}
        </div>
      </header>

      <div className="docs-body">
        <aside className="docs-rail">
          <nav className="docs-rail-list" aria-label={title}>
            {items.map(({ key, name, href, onSelect, active, children }) => {
              const cls = `docs-rail-item${active ? " is-active" : ""}`;
              const inner = (
                <>
                  <span>{name}</span>
                  <ChevronRight size={15} strokeWidth={1.75} aria-hidden="true" />
                </>
              );

              if (children?.length) {
                const isOpen = open.includes(key);
                return (
                  <div key={key} className="docs-rail-group">
                    <button
                      type="button"
                      className={`docs-rail-item is-section${isOpen ? " is-open" : ""}`}
                      aria-expanded={isOpen}
                      onClick={() =>
                        setOpen(o => (o.includes(key) ? o.filter(k => k !== key) : [...o, key]))
                      }
                    >
                      {inner}
                    </button>
                    {isOpen && (
                      <div className="docs-rail-sub">
                        {children.map(c => (
                          <Link
                            key={c.key}
                            href={c.href ?? "#"}
                            className={`docs-rail-item is-child${c.active ? " is-active" : ""}`}
                            aria-current={c.active ? "page" : undefined}
                          >
                            {c.Icon && <c.Icon size={14} strokeWidth={1.75} />}
                            <span>{c.name}</span>
                          </Link>
                        ))}
                      </div>
                    )}
                  </div>
                );
              }

              return href ? (
                <Link key={key} href={href} className={cls}>{inner}</Link>
              ) : (
                <button
                  key={key}
                  type="button"
                  className={cls}
                  aria-current={active ? "page" : undefined}
                  onClick={onSelect}
                >
                  {inner}
                </button>
              );
            })}
          </nav>

        </aside>

        <main className="docs-main">
          <div className="docs-main-inner">{children}</div>
        </main>
      </div>

      {support && <SupportModal onClose={() => setSupport(false)} />}
    </div>
  );
}
