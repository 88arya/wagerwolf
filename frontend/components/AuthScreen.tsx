"use client";

import { useRef, useState, type CSSProperties } from "react";
import Link from "next/link";
import { startGoogleRedirect } from "@/lib/googleAuth";
import BarePageHeader from "@/components/BarePageHeader";
import SignedOutOnly from "@/components/SignedOutOnly";

/**
 * The shared body of BOTH auth screens — /signup and /sign-in.
 *
 * ONE COMPONENT, NOT TWO PAGES. The two screens are the same field, the same
 * Google call and the same footnote; they differ in a heading and in the one
 * line underneath. Cloning the file would have meant two copies of every note
 * below, and the failure mode for near-identical auth screens is that a change
 * lands on one and not the other. The pages are thin wrappers that pass text.
 *
 * The way in. "Play now" in the utility bar routes here.
 *
 * This replaced a modal, which replaced a section of the landing page. A page
 * rather than a dialog because the bar's button is the only entry point in the
 * app and a dialog gave it no URL: nothing to link to, nothing to come back to,
 * and no way to send someone straight to sign-up.
 *
 * BARE ROUTE. It carries its own wordmark top-left, so AppChrome is suppressed
 * here (see NO_CHROME) — otherwise the utility bar would put a second wordmark
 * directly above this one, with the games strip between them. The site footer
 * is suppressed too, via FooterSlot. Both are deliberate: this is the one
 * screen in the app that is meant to be nothing but itself.
 *
 * WHAT THE EMAIL FIELD ACTUALLY DOES — read this before trusting it.
 *
 * There is no email authentication in this app and never has been. Google is
 * the entire login surface: POST /users/auth/google takes a Google identity and
 * nothing else, `users.password` is written only for the ghost user, and there
 * is no mail transport configured anywhere in the backend. So this field cannot
 * create an account, cannot send a magic link and cannot check whether the
 * address is already registered.
 *
 * What it does instead: the address is passed to Google as `hint`, which
 * pre-selects that account in the chooser. So typing your address genuinely
 * shortens the flow, and Continue genuinely signs you in — but it signs you in
 * WITH GOOGLE, and a user who types an address that is not a Google account
 * will find that out at Google's screen rather than here.
 *
 * That is a real gap, not a styling detail. Closing it means either building
 * email auth (transport, verification tokens, a password or magic-link flow) or
 * relabelling this screen so it does not imply an email-first sign-up.
 */

// One centred column, everything full-bleed within it — the field, the button,
// the heading and the footnote all share this width, which is what keeps them
// flush left the way the reference does.
//
// 630. The two CTAs are `width: 100%` of this column, so the column IS their
// width; widening it is the only way to widen them without breaking the
// flush-left edge they share with the heading above them. It went 420 -> 840
// (too wide; the footnote trailed a lot of empty space) -> 630 -> 600 -> 570.
//
// `width: 100%` with this as a max, not a fixed width, so it still collapses on
// a narrow viewport rather than forcing a horizontal scroll.
const COL_W = 570;

// The header, its edge gaps and the lockup that sits in it all moved to
// components/BarePageHeader, shared with /settings and the legal pages.

/**
 * `altHref` is what separates the two screens' footers:
 *   absent  -> the control calls Google directly (what /signup does for a
 *              returning user: they pick an account rather than retyping an
 *              address this app cannot verify anyway).
 *   present -> it is an ordinary link to the other screen.
 */
type AuthScreenProps = {
  heading: string;
  altPrompt: string;
  altLabel: string;
  altHref?: string;
  /**
   * The lead-in to the consent footnote, up to and including "our". The two
   * links that follow are fixed — see the note where it renders.
   *
   * Parameterised because "By continuing" is right on a page you are signing UP
   * on and slightly off on one you are signing IN to. What must NOT change is
   * that the sentence still FORMS the agreement in both places: /sign-in runs
   * the same endpoint as /signup and creates an account when there is none, so
   * softening this to "see our Terms" would leave those accounts created
   * without agreeing to anything — and the 18+ requirement lives in the Terms
   * and nowhere else now. Reword the verb, keep "you agree".
   */
  consentLead?: string;
};

// The small underlined control under the form. Shared by both branches below so
// the link and the button are typographically identical — same size, same
// underline, same colour — and only their behaviour differs.
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
  // Continue was pressed with the field empty. Shown by swapping the label's
  // asterisk for "(required)", never as a separate line of text.
  const [missing, setMissing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  /**
   * Leaves for Google. The tab navigates; nothing after this runs.
   *
   * IT WAS A POPUP — `initCodeClient` with `ux_mode: "popup"`, which opened a
   * window that posted a code back to its opener while this page stayed put.
   * The whole exchange now happens across a full-tab redirect: this page goes
   * to Google, and Google returns to /auth/callback with the code. See
   * lib/googleAuth for why the URL is built by hand rather than by GIS.
   *
   * `busy` is deliberately left ON. There is no "finished" state to return to
   * on this screen any more — either the tab leaves, or the throw below puts a
   * message up. Clearing it would flash the buttons back to life a frame before
   * the page disappears.
   */
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
      // The label says so instead of a message appearing under the field:
      // the asterisk becomes "(required)". Nothing new is added to the page,
      // so nothing below it moves.
      setMissing(true);
      inputRef.current?.focus();
      return;
    }
    setMissing(false);
    // The email field is the only thing left to validate. The 18+ and terms
    // tickboxes that used to be checked here are gone — consent is now implied
    // by pressing Continue, stated in the footnote at the bottom of the page.
    setError("");
    setBusy(true);
    // `hint` is Google's login_hint: it pre-selects this address in the
    // chooser. It is a hint only — Google will still let them pick another.
    startGoogle(trimmed);
  }

  return (
    <div className="bare-route">
      {/* Already signed in? There is nothing here to do. */}
      <SignedOutOnly />
      {/* Shared with /settings and the legal pages. No Done here: this is an
          entry point, not somewhere you came from.

          COL_W IS PASSED SO THE LOCKUP SHARES THE COLUMN'S LEFT EDGE. Those
          other routes start their content at the screen edge and want the
          header's own 47px gap; this one centres a 570px column, so the
          default put the mark on a vertical nothing else on the page used. The
          20 is <main>'s side padding below — the two have to be the same
          number or they part company on a narrow window. */}
      <BarePageHeader columnWidth={COL_W} columnGutter={20} />

      <main
        style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          // Pulled slightly above true centre — optically centred copy sits a
          // little high, and the reference does the same.
          padding: "0 20px 10vh",
        }}
      >
        <div style={{ width: "100%", maxWidth: COL_W }}>
          {/* 550 — one step past the design system's stated 400-500 ceiling.
              A deliberate departure, not a slip: this is the only heading on a
              page with no chrome around it, and 500 read light against the
              reference. Inter Tight is loaded as a variable font, so 550 is a
              real interpolation on the weight axis rather than a fake bold. */}
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
            {/* The label lives inside the box above the input, so the border is
                one rectangle around both. .auth-field carries the focus ring,
                which an inline style cannot express. */}
            {/* `is-filled` keeps the label raised once there is text in the
                box. Without it the label would drop back over the user's own
                input the moment the field lost focus. */}
            <label
              className={`auth-field${email ? " is-filled" : ""}`}
              htmlFor="signup-email"
            >
              <span className="auth-field-label">
                Email address{" "}
                {missing ? (
                  // Not aria-hidden, unlike the asterisk it replaces: this one
                  // is the entire error message, so it has to be readable.
                  <span className="auth-field-required">(required)</span>
                ) : (
                  <span aria-hidden="true">*</span>
                )}
              </span>
              {/* No autoFocus. Focusing on load would raise the label before
                  anyone had seen it sitting in the box, which is the whole
                  point of it starting there. */}
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
                  // Clear the moment they start typing — leaving "(required)"
                  // up while the field fills would be scolding them for
                  // doing the thing we asked.
                  if (missing && e.target.value.trim()) setMissing(false);
                }}
                disabled={busy}
              />
            </label>

            {/* NO TICKBOXES. There were two here — an 18+ gate and a terms
                acceptance — and both were deliberately removed in favour of the
                single footnote at the bottom of this page.

                The consent model changed with them: it is implied by pressing
                Continue rather than given by ticking a box, and the 18+
                requirement lives in the Terms ("You must be 18 or older to use
                it", first paragraph of /terms) rather than on this screen. The
                footnote binds the user to those Terms, so the requirement is
                incorporated by reference — which is how nearly every sign-up
                does it, and it keeps this screen down to a field and a button.

                Do not add a tickbox back without deciding what it is FOR. The
                one that was here duplicated a line the Terms already carried,
                and a second place to state the same rule is a second place for
                it to drift. */}

            {error && (
              <p className="error" style={{ margin: "10px 0 0" }}>
                {error}
              </p>
            )}

            {/* Geometry lives in .auth-submit so it shares --auth-control-h
                with the field above and the two cannot drift apart. The label
                stays the white .mx-btn.is-primary ships — black on the accent
                was tried and reverted, it was the weakest contrast pairing on
                the page. */}
            <button
              type="submit"
              className="mx-btn is-primary auth-submit"
              style={{ marginTop: 12 }}
              disabled={busy}
            >
              Continue
            </button>
          </form>

          {/* Size and weight taken from .auth-field-label — the "Email address *" that
              sits in the box above — so the two pieces of small print under the
              form read as one voice. Colour is left alone: the label is --text-3
              because it is a placeholder, this is --text-2 because it is a
              sentence you are meant to read. */}
          <p style={{ margin: "14px 0 0", fontSize: "1rem", fontWeight: 450, color: "var(--text-2)" }}>
            {altPrompt}{" "}
            {/* The arrow is the ↗ character (U+2197), not a drawn svg. Being
                real text it inherits size, weight, colour and the underline
                automatically, and needs no vertical nudging to sit on the line.

                The gap before it is a real space in the text flow, NOT a
                margin. A margin sits outside the child's inline box so the
                underline breaks across it; a space is text, so it is underlined
                like any other character and the rule runs unbroken to the
                arrow. */}
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

      {/* The consent line, and the ONLY place consent is expressed now that the
          two tickboxes are gone.

          At the foot of the page rather than under the button: .bare-route is a
          column flex and <main> takes flex: 1, so this sits on the bottom edge
          of the viewport as page small print, which is the convention for it
          and keeps the form itself down to a field and a button.

          The links open in a new tab. Same reason as before: the form holds a
          typed email, and sending someone off to read the Terms should not cost
          them what they have already entered.

          Not inside a <label> any more, so the stopPropagation the old links
          needed is gone with it — there is no checkbox left for a click to
          toggle. */}
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
        {/* TERMS FIRST, Privacy second. The Terms are the document being
            agreed to — they are also where the 18+ requirement lives, which is
            the only place it exists now that the tickbox is gone — so they lead.
            The Privacy Policy is a disclosure that rides along. */}
        {consentLead}{" "}
        {/* ONE UNBREAKABLE RUN ON A PHONE — see .consent-run in globals.css.
            Without it the line broke between "Privacy" and "Policy", orphaning
            one word of a document's NAME on the last line. Bound, the sentence
            can only turn in front of the run, so it reads "…you agree to our"
            over "Terms of Service and Privacy Policy."

            LandingCta carries the identical span for the identical footnote.
            The two are separate components with separate copy, which is
            exactly why this had to be fixed twice — the landing page's was
            done first and this one was missed. */}
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
