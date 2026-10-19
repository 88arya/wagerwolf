"use client";

import { useEffect, useRef, useState } from "react";
import { api, apiError } from "@/lib/api";
import { SUPPORT_EMAIL, supportMailto, type SupportTopic } from "@/lib/support";

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

  useEffect(() => { emailRef.current?.focus(); }, []);

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
    } catch (err) {
      setError(apiError(err, "Could not send. Try again, or email us directly."));
      setState("idle");
    }
  }

  const ready = Boolean(email.trim() && message.trim());

  return (
    <div className="mx-scrim" onClick={onClose} role="presentation">
      <div
        className={`support-sheet${state === "sent" ? " is-sent" : ""}`}
        role="dialog"
        aria-modal="true"
        {...(state === "sent"
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

        {state === "sent" ? (
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
