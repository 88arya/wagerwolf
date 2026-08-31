"use client";

import { useState } from "react";
import SupportModal from "@/components/SupportModal";

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
 * the behaviour; .support-link is the appearance.
 *
 * IT CARRIES ITS OWN MODAL rather than reaching for a shared one. The modal is
 * mounted only while open, so a page with three of these pays nothing for the
 * two nobody pressed, and there is no provider to thread through the server
 * components these appear in.
 */
export default function SupportLink({
  children,
  className = "support-link",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)}>
        {children}
      </button>
      {open && <SupportModal onClose={() => setOpen(false)} />}
    </>
  );
}
