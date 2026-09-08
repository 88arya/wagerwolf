"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { SUPPORT_EMAIL, supportMailto, type SupportTopic } from "@/lib/support";

/**
 * Contact us - one dialog, from everywhere.
 *
 * There are four ways in: the root footer, the help menu at the bottom of the
 * signed-in sidebar, My Account, and the documents under /docs. They used to
 * differ - one opened a page, another a modal under its own heading - and this
 * is the standardisation: the same card, the same fields and the same wording
 * whichever was pressed. `topic` survives only as the subject line, which is
 * invisible here and is the one thing that sorts a question from a bug report
 * once both land in the same inbox.
 *
 * IT ASKS FOR AN EMAIL EVEN WHEN SIGNED IN, deliberately. Two of the four entry
 * points serve signed-out visitors - /docs is public, and so is the footer - so
 * taking the address from the session would mean two flows, one a form and one
 * a mailto. One field is cheaper than that fork, and a signed-in sender may
 * well want the reply somewhere other than their Google address anyway.
 * `POST /support` still records the account when a token is present.
 *
 * SEND POSTS. It used to compose a mailto: carrying the typed text - so you
 * wrote your message in a box that could not send it, then watched it reappear
 * in a mail client, under a button labelled Send that opened a draft. The
 * direct address is still offered in the lede for anyone who would rather use
 * their own mail app, or whose browser has no mailto: handler; it is a choice
 * now rather than the only path.
 *
 * The server writes the message down BEFORE attempting delivery and reports
 * which happened, so a provider outage means stored-and-not-yet-emailed rather
 * than lost. See backend/src/routes/support.routes.ts.
 */
export default function SupportModal({
  onClose, topic = "contact",
}: {
  onClose: () => void;
  topic?: SupportTopic;
}) {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState("");
  const emailRef = useRef<HTMLInputElement>(null);

  // Focus the first field, not the dialog: the only reason to open this is to
  // type into it.
  useEffect(() => { emailRef.current?.focus(); }, []);

  // Escape closes. A dialog dismissable only by finding the right target is one
  // people feel trapped in.
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function submit() {
    if (!email.trim() || !message.trim() || state === "sending") return;
    setState("sending");
    setError("");
    try {
      await api("/support", {
        method: "POST",
        body: JSON.stringify({ email: email.trim(), message: message.trim(), topic }),
      });
      setState("sent");
    } catch (err: any) {
      // lib/api throws the response body. For a 400 that is our own validation
      // message and worth showing verbatim; anything else is an internal string
      // the sender cannot act on, so it gets a generic line and the address.
      let msg = "Could not send. Try again, or email us directly.";
      try { msg = JSON.parse(String(err?.message ?? "")).error || msg; } catch { /* not our JSON */ }
      setError(msg);
      setState("idle");
    }
  }

  const ready = Boolean(email.trim() && message.trim());

  return (
    // The scrim closes on click; the sheet stops the click reaching it, which is
    // why the handler is a stopPropagation rather than a check on the target.
    <div className="mx-scrim" onClick={onClose} role="presentation">
      <div
        className={`support-sheet${state === "sent" ? " is-sent" : ""}`}
        role="dialog"
        aria-modal="true"
        {...(state === "sent"
          // The heading is gone in this state, so there is nothing to point at.
          // A labelledby aimed at the confirmation sentence would announce the
          // whole thing as the dialog's name.
          ? { "aria-label": "Message sent" }
          : { "aria-labelledby": "support-title" })}
        onClick={(e) => e.stopPropagation()}
      >
        <button type="button" className="support-x" onClick={onClose} aria-label="Close">
          <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor"
               strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
            <path d="M3 3l8 8M11 3l-8 8" />
          </svg>
        </button>

        {/* THE WHOLE CARD SWAPS, not just the fields. The heading and the lede
            used to sit above the confirmation, so a sent message still read
            "Contact us / ...or email us directly at..." with the receipt
            underneath — an invitation to do the thing that had just been done.
            Once it is sent there is one thing to say. */}
        {state === "sent" ? (
          // The address is not repeated back. It is two lines above in the
          // field they just typed it into, and the useful half of a confirmation
          // is what happens next rather than a readback of what they entered.
          <p className="support-sent">
            Your message has been sent, we will respond within 5 business days.
          </p>
        ) : (
          <>
            <h2 id="support-title" className="support-title">Contact us</h2>

            <p className="support-line">
              Include any relevant details, or email us directly at{" "}
              <a className="support-email" href={supportMailto(topic)}>{SUPPORT_EMAIL}</a>
            </p>

            <input
              ref={emailRef}
              type="email"
              className="mx-field support-input"
              placeholder="Your email address"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <textarea
              className="mx-field support-box"
              placeholder="Your message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={5}
            />

            {error && <p className="mx-field-error support-error">{error}</p>}

            <div className="support-actions">
              <button
                type="button"
                className="mx-btn is-primary"
                disabled={!ready || state === "sending"}
                onClick={submit}
              >
                {state === "sending" ? "Sending..." : "Send"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
