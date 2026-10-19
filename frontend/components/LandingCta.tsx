"use client";

import { useId, useRef, useState } from "react";
import { startGoogleRedirect } from "@/lib/googleAuth";

export default function LandingCta({ consent = true }: {
  consent?: boolean;
} = {}) {
  const [email, setEmail] = useState("");
  const [missing, setMissing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const inputId = `lp-email-${useId()}`;

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = email.trim();
    if (!trimmed) {
      setMissing(true);
      inputRef.current?.focus();
      return;
    }
    setMissing(false);
    setError("");
    setBusy(true);
    try {
      startGoogleRedirect(trimmed);
    } catch (err) {
      setBusy(false);
      setError(err instanceof Error ? err.message : "Google sign-in could not start");
    }
  }

  return (
    <div className="lp-cta">
      <form className="lp-cta-row" onSubmit={onSubmit}>
        <label className={`auth-field${email ? " is-filled" : ""}`} htmlFor={inputId}>
          <span className="auth-field-label">
            Email address
            {missing && <span className="auth-field-required"> (required)</span>}
          </span>
          <input
            ref={inputRef}
            id={inputId}
            className="auth-field-input"
            type="email"
            autoComplete="email"
            aria-invalid={missing || undefined}
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              if (missing && e.target.value.trim()) setMissing(false);
            }}
            disabled={busy}
          />
        </label>

        <button type="submit" className="mx-btn is-primary lp-play" disabled={busy}>
          Play now
        </button>
      </form>

      {error && <p className="error lp-cta-error">{error}</p>}

      {consent && (
      <p className="lp-consent">
        By submitting your email, you agree to our{" "}
        <span className="consent-run">
          <a href="/docs/terms-of-service" target="_blank" rel="noopener noreferrer">
            Terms of Service
          </a>{" "}
          and{" "}
          <a href="/docs/privacy-policy" target="_blank" rel="noopener noreferrer">
            Privacy Policy
          </a>
          .
        </span>
      </p>
      )}
    </div>
  );
}
