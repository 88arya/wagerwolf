"use client";

import { useId, useRef, useState } from "react";
import { startGoogleRedirect } from "@/lib/googleAuth";

/**
 * The landing page's email field with Play now set into it. Rendered twice -
 * in the hero and again in the closing band before the footer - which is why
 * the input's id is generated per instance rather than written down.
 *
 * ONE CONTROL, NOT TWO. The button sits inside the field's rectangle, so the
 * pair reads as a single call to action rather than a form with a submit beside
 * it. The field is /sign-in's `.auth-field`, borrowed rather than rebuilt, so
 * the box a visitor meets here is the same object they meet after pressing it —
 * floating label and all. Only the button is landing-specific, because inset it
 * can no longer take `.auth-submit`'s full width and 60px height.
 *
 * "Play now" rather than "Continue": inside the field it is the only label on
 * the screen naming what happens, where on /sign-in it followed a heading that
 * had already said so.
 *
 * IT DOES WHAT /sign-in DOES. The email is not collected or stored — it is
 * Google's `login_hint`, which pre-selects that address in the chooser and is
 * a hint only, since Google will still let them pick another. Play now leaves
 * for Google, and `POST /users/auth/google` signs in an existing user or
 * creates one, so nobody typing an unknown address hits an error.
 *
 * WHICH MEANS THE FOOTNOTE UNDER IT IS THE AGREEMENT, not a notice. Pressing
 * Play now can create an account, and the 18+ requirement lives in the Terms
 * rather than on any screen, so that sentence is what binds it — the same model
 * /signup uses after its tickboxes were removed. Softening it to "see our
 * Terms" would leave accounts created without agreeing to anything.
 *
 * `busy` is deliberately never cleared on success: the tab is leaving, and
 * clearing it would flash the button back to life a frame before the page
 * disappears.
 */
export default function LandingCta({ consent = true }: {
  /**
   * The Terms/Privacy footnote under the control.
   *
   * ON BY DEFAULT, and that default is the safe one: pressing Play now can
   * create an account, so this sentence is the AGREEMENT rather than a notice -
   * the same model /signup uses since its tickboxes were removed. A form that
   * submits without it anywhere on the page would be creating accounts against
   * terms nobody was shown.
   *
   * Turned off for the closing band, where the identical control appears a
   * second time on the same page and the footnote above it already binds. Do
   * not turn it off on a page where this is the only instance.
   */
  consent?: boolean;
} = {}) {
  const [email, setEmail] = useState("");
  const [missing, setMissing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  /* THE ID MUST BE PER-INSTANCE. This renders twice on the landing page - once
     in the hero, once in the closing band - and a hardcoded id would put the
     same one on two inputs. The label points at an id, and the first match
     wins, so clicking the closing form's label would focus the hero's field
     halfway up the page. useId gives each mount its own. */
  const inputId = `lp-email-${useId()}`;

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = email.trim();
    if (!trimmed) {
      // The label says so rather than a message appearing under the row: the
      // asterisk becomes "(required)". Nothing is added to the page, so nothing
      // below it moves — which matters more here than on /sign-in, because the
      // consent line sits directly underneath.
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
        {/* The label sits inside the box and rises out of it, so the border is
            one rectangle around both. `is-filled` keeps it raised once there is
            text, or it would drop back over the typed address on blur. */}
        <label className={`auth-field${email ? " is-filled" : ""}`} htmlFor={inputId}>
          {/* NO ASTERISK, unlike /sign-in's copy of this field. There is one
              field on this page and nothing optional to distinguish it from, so
              the mark would be marking a distinction that does not exist.

              "(required)" still appears, but only as the error: the label is
              the whole message when Play now is pressed empty, which is why
              nothing new is added below the row and nothing moves. The space is
              inside the span so it arrives with the word. */}
          <span className="auth-field-label">
            Email address
            {missing && <span className="auth-field-required"> (required)</span>}
          </span>
          {/* No autoFocus. Focusing on load would raise the label before anyone
              had seen it resting in the box, which is the point of it starting
              there — and it would scroll a landing page to its own form. */}
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
              // Cleared as soon as they start typing — leaving "(required)" up
              // while the field fills is scolding them for complying.
              if (missing && e.target.value.trim()) setMissing(false);
            }}
            disabled={busy}
          />
        </label>

        {/* OUTSIDE THE LABEL, INSIDE THE BOX. It is absolutely positioned into
            .auth-field's rectangle rather than nested in it: a <label> wrapping
            an interactive element is invalid, and clicking it would fight the
            label's own job of focusing the input. Sibling plus position is the
            same picture without that conflict. */}
        <button type="submit" className="mx-btn is-primary lp-play" disabled={busy}>
          Play now
        </button>
      </form>

      {error && <p className="error lp-cta-error">{error}</p>}

      {/* TERMS FIRST, Privacy second: the Terms are the document being agreed
          to and the only place the 18+ requirement now exists, so they lead.
          The Privacy Policy is a disclosure riding along.

          New tab, so reading them does not cost the typed email. */}
      {consent && (
      <p className="lp-consent">
        By submitting your email, you agree to our{" "}
        {/* THE TWO DOCUMENTS AND THE WORD JOINING THEM ARE ONE RUN, and the
            span exists so a media query can make it unbreakable — see
            .lp-consent-run at the bottom of globals.css. Left to itself the
            sentence broke inside "Privacy Policy" on a phone, orphaning one
            word of a document's name on its own line. Bound, the sentence can
            only turn in front of the run, so the footnote is "…you agree to
            our" over "Terms of Service and Privacy Policy."

            It is a run rather than a <br>, so nothing is forced: where the
            whole sentence fits on one line it stays on one line. */}
        <span className="lp-consent-run">
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
