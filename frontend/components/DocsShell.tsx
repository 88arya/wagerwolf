"use client";

import { useState } from "react";
import type { ComponentType } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronRight, Moon, Sun } from "lucide-react";
import Logo from "@/components/Logo";
import SupportModal from "@/components/SupportModal";
import { writeDocsTheme } from "@/lib/docsTheme";

/**
 * The three-region shell the document-ish routes share: a top bar, a nav rail,
 * and a content pane, every division a 1px rule.
 *
 * TWO ROUTES USE IT — /legal and /settings — which is why it is a component
 * rather than markup in either. They differ only in the word beside the mark
 * and what the rail lists, and the thing that must NOT differ is the vertical
 * line down the page: the brand block and the rail have to be the same width or
 * the layout reads as a misaligned box. One component is how that stays true.
 *
 * THE RAIL TAKES LINKS OR BUTTONS. /legal's rows are routes; /settings' rows
 * are local state, because its tabs deliberately never touch the URL. An item
 * with `href` renders a Link, one with `onSelect` renders a button, and both
 * draw identically — the rail should not look different because of how the
 * thing behind it happens to be implemented.
 *
 * CONTACT SUPPORT IS PART OF THE SHELL, sectioned off at the foot. It is not a
 * document or a settings pane, so it does not belong in the list; it is the
 * other thing someone on either route plausibly wants.
 */
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
  /**
   * The documents in this section. A row with children NAVIGATES NOWHERE — it
   * opens and closes the list under it, and the children are the links.
   *
   * That is why the shell's title is a link now: with the section rows turned
   * into disclosures, nothing pointed at /docs any more.
   *
   * /settings passes none of these. Its rail is three flat buttons holding
   * local tab state, and it must keep drawing exactly as it did.
   */
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
  /** Where the title links. Omitted leaves it plain text — see the render. */
  titleHref?: string;
  /**
   * WHERE YOU ARE, at the left of the top bar's right-hand pane.
   *
   * It names the RAIL SECTION, not the document — Home, Legal or Play — because
   * the document already names itself in the heading below, and repeating it
   * would say the same thing twice on one screen. What is not otherwise stated
   * anywhere is which of the rail's two groups you are inside, since the rows
   * mark the active page with nothing at all now.
   *
   * Omitted on /settings, which has no sections to be in.
   */
  crumb?: string;
  /**
   * Show the Done button.
   *
   * ON BY DEFAULT, AND /settings NEEDS IT. Done is `router.back()`, which is
   * the right thing for a route you navigated to in this tab and the wrong
   * thing for one opened in its own: /docs is opened with target=_blank from
   * the sidebar, so its history has nowhere to go back TO, and the way out is
   * closing the tab.
   *
   * It was also actively bad there. Every rail row and every card on the index
   * pushes a history entry, so Done went back one page at a time and a reader
   * who had opened three documents needed three presses to reach the app.
   *
   * The wolf mark stays a link to / in both cases, which is the exit for
   * someone who arrived on /docs directly from a bookmark or a shared link and
   * has no tab to close.
   */
  done?: boolean;
  /**
   * Show the light/dark switch, and let this shell be darkened.
   *
   * OFF BY DEFAULT, AND /settings LEAVES IT OFF. Both routes share this shell,
   * and the switch belongs to /docs alone — app/docs/layout.tsx is the only
   * caller that passes it.
   *
   * DARK IS THE DEFAULT on the routes that pass this. Light stays available
   * from the switch and is remembered in the "docs_theme" cookie, which the
   * server reads — see `initialDark`.
   *
   * THE APP HAS NO DARK MODE and this does not give it one. CLAUDE.md records
   * light as the only theme, with the old ThemeToggle, the `data-theme`
   * attribute and the "theme" localStorage key all deliberately removed. What
   * this does is repaint ONE COMPONENT by overriding colour tokens on
   * .docs-shell.is-dark, so the dark values exist nowhere above this element
   * and cannot cascade into the app. No class or attribute is set on <html> or
   * <body>, and the cookie is "docs_theme" rather than "theme", scoped to
   * path=/docs, so it cannot be mistaken for the removed global one.
   */
  theme?: boolean;
  /**
   * The theme to render, as the server read it from the docs_theme cookie.
   * app/docs/layout.tsx passes it; nothing else needs to.
   */
  initialDark?: boolean;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [support, setSupport] = useState(false);
  /**
   * SEEDED FROM THE SERVER'S ANSWER, AND NEVER CORRECTED AFTER MOUNT.
   *
   * This was localStorage read in an effect. The server cannot see
   * localStorage, so it had to guess, and whoever it guessed wrong for got the
   * wrong theme for a frame before the effect fixed it: light-then-dark when
   * the default was light, dark-then-light for anyone who had chosen light
   * after the default flipped. The cookie reaches the server with the request,
   * so the first paint is the final one and there is nothing left to correct.
   *
   * The old localStorage key is deliberately NOT migrated. Reading it would
   * need exactly the post-mount correction this removes, and the site had not
   * launched, so resetting a handful of choices to the dark default is cheap.
   */
  const [dark, setDark] = useState(initialDark);
  /**
   * Which sections are expanded.
   *
   * SEEDED FROM THE ACTIVE SECTION, not empty: arriving on a document with its
   * section collapsed would hide the row saying where you are. Seeded in the
   * initializer rather than an effect so it is right on the first paint — no
   * browser API is involved, unlike the theme above, so there is no SSR
   * mismatch to avoid.
   *
   * Opening one does not close the others. These are short lists and the rail
   * has room for both; an accordion that shuts the section you just left makes
   * comparing two documents a fight.
   */
  const [open, setOpen] = useState<string[]>(() =>
    items.filter(i => i.children?.some(c => c.active)).map(i => i.key),
  );

  function toggleTheme() {
    const v = !dark;
    setDark(v);
    // Outside the updater: a state updater must be pure, and Strict Mode runs
    // it twice. A blocked cookie still applies for this visit.
    writeDocsTheme(v);
  }

  return (
    <div className={`docs-shell${theme && dark ? " is-dark" : ""}`}>
      <header className="docs-topbar">
        {/* The brand block is the rail's width, so the divider under it
            continues the rail's own right edge as one unbroken line. */}
        <div className="docs-brand">
          <Link href="/" aria-label="Wagerwolf home" className="docs-brand-mark">
            {/* bare: the head alone in currentColor, no accent tile. The bar is
                already a white surface, so the filled tile would read as a
                sticker on it rather than as the mark. */}
            <Logo size={28} bare />
          </Link>
          {/* A drawn rule, not a "|" glyph: a pipe takes its weight and height
              from the font and would be the one line here not matching the
              others. */}
          <span className="docs-brand-rule" aria-hidden="true" />
          {/* A LINK WHEN THERE IS AN INDEX BEHIND IT. The section rows are
              disclosures now and light nothing on /docs, so without this the
              index is reachable only from the sidebar or the back button.
              /settings passes no titleHref and keeps plain text — its rail is
              local tab state with no index behind it. */}
          {titleHref ? (
            <Link href={titleHref} className="docs-brand-name is-link">{title}</Link>
          ) : (
            <span className="docs-brand-name">{title}</span>
          )}
        </div>

        <div className="docs-topbar-main">
          {/* `margin-right: auto` on the label is what splits the pane, rather
              than `space-between` on the parent: with no crumb the buttons must
              stay hard right, and space-between with a single child would drive
              them to the left edge. */}
          {crumb && <span className="docs-crumb">{crumb}</span>}
          {/* router.back(), matching BarePageHeader: these routes are reached
              from the sidebar menu, the footer and links in copy, and Done means
              "return me to where I was" — only history knows that. */}
          {/* BEFORE Done, so the primary action stays the last thing on the
              row and in the tab order. */}
          {theme && (
            <button
              type="button"
              className="docs-theme"
              onClick={toggleTheme}
              aria-pressed={dark}
              // The label says what pressing it DOES, not what is currently on:
              // a switch announced as "Dark" while already dark is ambiguous.
              aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
              title={dark ? "Light mode" : "Dark mode"}
            >
              {/* ONE MARK AT A TIME, and it is WHAT PRESSING GIVES YOU rather
                  than the mode you are in: sun when dark, moon when light.
                  That is what the aria-label and the title already say — both
                  name the destination, not the current state — so all three
                  agree.

                  Showing both at once with the active one lit was tried and
                  reverted: it turns a button into a two-position switch, which
                  invites the reader to press the half they want rather than
                  press the button, and the halves are not separately
                  pressable. */}
              {dark
                ? <Sun size={16} strokeWidth={1.75} aria-hidden="true" />
                : <Moon size={16} strokeWidth={1.75} aria-hidden="true" />}
            </button>
          )}
          {/* CONTACT SUPPORT, to the right of the switch.

              It was a row at the foot of the rail. The rail lists PLACES — two
              sections and the documents in them — and this is the one control
              there that opened a dialog instead of going somewhere, which is
              why it kept needing to be told apart from its neighbours: first by
              a divider, then by an icon, then by neither. In the top bar it is
              among the other controls and needs no such marking.

              Quiet, not filled: Done beside it is the primary action on the
              routes that have one, and two solid buttons in a row read as two
              equals. */}
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

              // A SECTION. The row is a disclosure and the documents under it
              // are the links. The caret is the same glyph the flat rows carry,
              // rotated by CSS, so the rail keeps one vocabulary rather than
              // introducing a second arrow for a second kind of row.
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
          {/* A wrapper, because .docs-main is the SCROLLER and cannot also be
              the centred column: capping its width would cap the scrollbar's
              track with it and float the bar in from the pane's edge. The pane
              stays full width and scrolls; this holds the measure. */}
          <div className="docs-main-inner">{children}</div>
        </main>
      </div>

      {support && <SupportModal onClose={() => setSupport(false)} />}
    </div>
  );
}
