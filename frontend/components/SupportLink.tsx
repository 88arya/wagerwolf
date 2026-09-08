"use client";

import { useState } from "react";
import SupportModal from "@/components/SupportModal";
import type { SupportTopic } from "@/lib/support";

/**
 * "Contact us", wherever it appears, as one control.
 *
 * WHY IT EXISTS. /contact was a page, and every route to support was a link to
 * it: the footer, the legal documents' closing paragraphs, the sidebar's help
 * menu. The docs rail was the odd one out — its Contact Support row opened a
 * modal instead, on the reasoning that support should not take you away from
 * the page you are reading in order to ask about it.
 *
 * That reasoning applies to all of them, so the page is deleted and this is
 * what the links became. Every contact control in the app now does the same
 * thing, and there is one place to change when SupportModal grows a backend
 * (its `submit` composes a mailto: today — see lib/support).
 *
 * A BUTTON DRAWN AS A LINK. It sits inside running prose in the legal
 * documents, so it has to sit on the text baseline and take the paragraph's
 * own size and colour — but it opens a dialog rather than navigating, and an
 * <a> without an href is not focusable or operable by keyboard. The element is
 * the behaviour; the class is the appearance.
 *
 * WHICH CLASS. `.support-link` (the default) is the in-prose look: a button
 * reset plus an accent underline. Somewhere that supplies its own type — the
 * footer's link columns — pass `.btn-bare` instead, which is the reset without
 * the appearance. Do NOT pass both `.support-link` and a context class: they
 * are single-class selectors landing on one element, so the winner is decided
 * by source order in globals.css rather than by intent, and `.support-link`'s
 * `font: inherit` resolves against the PARENT rather than against the class
 * beside it. The footer did exactly that and rendered two rows at body size
 * and full white among six at 0.8rem and 62%.
 *
 * IT CARRIES ITS OWN MODAL rather than reaching for a shared one. The modal is
 * mounted only while open, so a page with three of these pays nothing for the
 * two nobody pressed, and there is no provider to thread through the server
 * components these appear in.
 */
export default function SupportLink({
  children,
  className = "support-link",
  topic,
}: {
  children: React.ReactNode;
  className?: string;
  /** Which entry point this is — sets the modal's heading and the mail subject. */
  topic?: SupportTopic;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)}>
        {children}
      </button>
      {open && <SupportModal onClose={() => setOpen(false)} topic={topic} />}
    </>
  );
}
