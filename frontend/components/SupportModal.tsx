"use client";

import { useEffect, useRef, useState } from "react";
import { SUPPORT_EMAIL, supportMailto } from "@/lib/support";

/**
 * Contact support: a box to type in, or the address to write to directly.
 *
 * THERE IS NO SUPPORT ENDPOINT, and this does not pretend otherwise. Nothing on
 * the backend accepts a message — no route, no table, no inbox — so Send hands
 * the text to the person's own mail client through a mailto: carrying the body,
 * rather than posting it somewhere and showing a "thanks, we'll be in touch"
 * that nobody would ever read. The address is shown in full beside it so the
 * mailto is a convenience rather than the only way through: a browser with no
 * mail client configured does nothing with mailto: links, and that would
 * otherwise be a dead end.
 *
 * When a real endpoint exists, `submit` is the one function to change.
 *
 * Centred rather than anchored to whatever opened it: this is a task, not a
 * menu, and it is opened from a rail that may sit on either side of the layout
 * depending on the route.
 */
export default function SupportModal({ onClose }: { onClose: () => void }) {
  const [message, setMessage] = useState("");
  const boxRef = useRef<HTMLTextAreaElement>(null);

  // Focus the box, not the dialog: the only reason to open this is to type.
  useEffect(() => { boxRef.current?.focus(); }, []);

  // Escape closes. A modal that can only be dismissed by finding the right
  // button is a modal people feel trapped in.
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  function submit() {
    if (!message.trim()) return;
    window.location.href = supportMailto(message);
    onClose();
  }

  return (
    // The scrim closes on click; the sheet stops the click reaching it, which is
    // why the handler is a stopPropagation rather than a check on the target.
    <div className="mx-scrim" onClick={onClose} role="presentation">
      <div
        className="mx-sheet support-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="support-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="support-title" className="mx-pane-title">Contact support</h2>
        <p className="support-lede">
          Tell us what happened and we will get back to you.
        </p>

        <textarea
          ref={boxRef}
          className="mx-field support-box"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="What can we help with?"
          rows={6}
        />

        <div className="support-actions">
          {/* The address in full, and a real link. Someone who would rather use
              their own mail app, or who has no mailto: handler, needs to be
              able to READ it — and to copy it. */}
          <span className="support-direct">
            Or email us at <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>
          </span>
          <span className="support-buttons">
            <button type="button" className="mx-btn is-quiet" onClick={onClose}>Cancel</button>
            <button
              type="button"
              className="mx-btn is-primary"
              disabled={!message.trim()}
              onClick={submit}
            >
              Send
            </button>
          </span>
        </div>
      </div>
    </div>
  );
}
