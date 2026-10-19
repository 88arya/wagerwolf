"use client";

import { useRef, useState, type CSSProperties } from "react";
import Link from "next/link";
import { startGoogleRedirect } from "@/lib/googleAuth";
import BarePageHeader from "@/components/BarePageHeader";
import SignedOutOnly from "@/components/SignedOutOnly";

const COL_W = 570;

type AuthScreenProps = {
  heading: string;
  altPrompt: string;
  altLabel: string;
  altHref?: string;
  consentLead?: string;
};

const ALT_ACTION: CSSProperties = {
  background: "none",
  border: "none",
  padding: 0,
  font: "inherit",
  color: "var(--text)",
  textDecoration: "underline",
};

export default function AuthScreen({
  heading,
  altPrompt,
  altLabel,
  altHref,
  consentLead = "By continuing, you agree to our",
}: AuthScreenProps) {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [missing, setMissing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function startGoogle(hint?: string) {
    try {
      startGoogleRedirect(hint);
    } catch (err) {
      setBusy(false);
      setError(err instanceof Error ? err.message : "Google sign-in could not start");
    }
  }

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
    startGoogle(trimmed);
  }

  return (
    <div className="bare-route">
      <SignedOutOnly />
      <BarePageHeader columnWidth={COL_W} columnGutter={20} />

      <main
        style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "0 20px 10vh",
        }}
      >
        <div style={{ width: "100%", maxWidth: COL_W }}>
          <h1
            style={{
              margin: "0 0 18px",
              fontSize: "1.6rem",
              fontWeight: 550,
              letterSpacing: "-0.028em",
              lineHeight: 1.05,
              color: "var(--text)",
            }}
          >
            {heading}
          </h1>

          <form onSubmit={onSubmit}>
            <label
              className={`auth-field${email ? " is-filled" : ""}`}
              htmlFor="signup-email"
            >
              <span className="auth-field-label">
                Email address{" "}
                {missing ? (
                  <span className="auth-field-required">(required)</span>
                ) : (
                  <span aria-hidden="true">*</span>
                )}
              </span>
              <input
                ref={inputRef}
                id="signup-email"
                className="auth-field-input"
                type="email"
                autoComplete="email"
                aria-invalid={missing || undefined}
                value={email}
                onChange={e => {
                  setEmail(e.target.value);
                  if (missing && e.target.value.trim()) setMissing(false);
                }}
                disabled={busy}
              />
            </label>

            {error && (
              <p className="error" style={{ margin: "10px 0 0" }}>
                {error}
              </p>
            )}

            <button
              type="submit"
              className="mx-btn is-primary auth-submit"
              style={{ marginTop: 12 }}
              disabled={busy}
            >
              Continue
            </button>
          </form>

          <p style={{ margin: "14px 0 0", fontSize: "1rem", fontWeight: 450, color: "var(--text-2)" }}>
            {altPrompt}{" "}
            {altHref ? (
              <Link href={altHref} style={ALT_ACTION}>
                {altLabel} <span aria-hidden="true">↗</span>
              </Link>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setError("");
                  setBusy(true);
                  startGoogle();
                }}
                disabled={busy}
                style={{ ...ALT_ACTION, cursor: busy ? "not-allowed" : "pointer" }}
              >
                {altLabel} <span aria-hidden="true">↗</span>
              </button>
            )}
          </p>
        </div>
      </main>

      <p
        style={{
          margin: 0,
          padding: "0 20px 28px",
          textAlign: "center",
          fontSize: "0.8rem",
          fontWeight: 450,
          lineHeight: 1.5,
          color: "var(--text-3)",
        }}
      >
        {consentLead}{" "}
        <span className="consent-run">
          <a
            href="/docs/terms-of-service"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: "var(--text-2)", textDecoration: "underline" }}
          >
            Terms of Service
          </a>{" "}
          and{" "}
          <a
            href="/docs/privacy-policy"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: "var(--text-2)", textDecoration: "underline" }}
          >
            Privacy Policy
          </a>
          .
        </span>
      </p>
    </div>
  );
}
