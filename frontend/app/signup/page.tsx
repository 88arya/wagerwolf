"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useGoogleOAuth, type CodeClientConfig, type CodeResponse } from "@react-oauth/google";
import { api } from "@/lib/api";
import { setToken } from "@/lib/auth";
import BarePageHeader from "@/components/BarePageHeader";
import SignedOutOnly from "@/components/SignedOutOnly";

/**
 * The package drives window.google.accounts.oauth2 internally but ships no
 * global declaration for it, so state the slice we use.
 */
declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initCodeClient(
            config: CodeClientConfig & { error_callback?: (err: unknown) => void },
          ): { requestCode: () => void };
        };
      };
    };
  }
}

/**
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

export default function SignupPage() {
  const router = useRouter();
  const { clientId, scriptLoadedSuccessfully } = useGoogleOAuth();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // Continue was pressed with the field empty. Shown by swapping the label's
  // asterisk for "(required)", never as a separate line of text.
  const [missing, setMissing] = useState(false);
  // The age gate, and the whole of it on this side. Unticked is not an error
  // until Continue is pressed — see `ageMissing`.
  const [ageOk, setAgeOk] = useState(false);
  const [ageMissing, setAgeMissing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function finish(code: string) {
    setBusy(true);
    setError("");
    try {
      const res = await api("/users/auth/google", {
        method: "POST",
        body: JSON.stringify({ code, ageConfirmed: ageOk }),
      });
      setToken(res.token);
      localStorage.setItem("userId", res.userId);
      localStorage.setItem("displayName", res.displayName ?? "");
      // Straight in. There is nothing left to ask: the name comes from Google,
      // and the display name, tag and colour are all derived — per league by
      // backend/src/services/leagueIdentity.ts, and editable in My Account.
      router.push("/home");
    } catch (err) {
      const raw = err instanceof Error ? err.message : String(err);
      try {
        setError(JSON.parse(raw).error ?? raw);
      } catch {
        setError(raw);
      }
      setBusy(false);
    }
  }

  /**
   * Opens Google's popup and hands the resulting code to the backend, which
   * exchanges it for an ID token — see POST /users/auth/google.
   *
   * The auth-code flow, not Google's own <GoogleLogin> button: that renders
   * into a cross-origin iframe we cannot style, which is no use on a screen
   * whose whole point is the button underneath.
   *
   * AND NOT useGoogleLogin EITHER, which is the same flow but cannot carry the
   * hint. That hook builds its client inside an effect whose dependency array
   * is [clientId, scriptLoadedSuccessfully, flow, scope, state] — `hint` rides
   * in on a `...props` spread and is NOT among them, so the client is built
   * once with whatever hint existed on first render (empty) and is never
   * rebuilt when the user types. The hint would silently never apply. Building
   * the client per click sidesteps that and is what the hook does anyway, once.
   */
  function startGoogle(hint?: string) {
    const oauth2 = window.google?.accounts?.oauth2;
    if (!scriptLoadedSuccessfully || !oauth2) {
      setBusy(false);
      setError("Google sign-in is still loading — try again in a moment");
      return;
    }
    oauth2
      .initCodeClient({
        client_id: clientId,
        scope: "openid profile email",
        ux_mode: "popup",
        ...(hint ? { hint } : {}),
        callback: (response: CodeResponse) => {
          if (response.code) finish(response.code);
          else {
            setBusy(false);
            setError("Google sign-in failed");
          }
        },
        // Closing Google's popup is an ordinary thing to do, not an error worth
        // shouting about — but leaving `busy` stuck on would be.
        error_callback: () => setBusy(false),
      })
      .requestCode();
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = email.trim();
    if (!trimmed) {
      // The label says so instead of a message appearing under the field:
      // the asterisk becomes "(required)". Nothing new is added to the page,
      // so nothing below it moves.
      setMissing(true);
      setAgeMissing(!ageOk);
      inputRef.current?.focus();
      return;
    }
    setMissing(false);
    // Not enforced here in any meaningful sense — the server refuses to create
    // an account without it (POST /users/auth/google). This is so the refusal
    // happens before a trip to Google rather than after one.
    if (!ageOk) { setAgeMissing(true); return; }
    setAgeMissing(false);
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
      {/* Shared with /settings and the legal pages, so the lockup lands on the
          same pixel on all five. No Done here: this is an entry point, not
          somewhere you came from. */}
      <BarePageHeader />

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
            Welcome to Wagerwolf
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

            {/* The age gate, in full. It replaced a whole second screen that
                collected a date of birth: both are self-attested, so neither is
                evidence, and only one of them costs a page. What is kept is the
                record that the question was put — User.ageConfirmedAt, stamped
                server-side. See backend/src/services/age.ts.

                A real <input type="checkbox">, which globals.css hands back to
                the platform at the bottom of the file precisely so boxes like
                this one render as boxes. */}
            <label
              style={{
                display: "flex",
                // The label is one line, so centring the two against each other
                // is the alignment — it was flex-start with a 3px nudge on the
                // box, which is a guess that only holds at one font size.
                alignItems: "center",
                gap: 10,
                margin: "14px 0 0",
                fontSize: "0.95rem",
                fontWeight: 450,
                color: ageMissing ? "var(--loss)" : "var(--text-2)",
                cursor: "pointer",
              }}
            >
              <input
                type="checkbox"
                className="auth-check"
                checked={ageOk}
                disabled={busy}
                aria-invalid={ageMissing || undefined}
                onChange={e => {
                  setAgeOk(e.target.checked);
                  // Clear the moment they comply, rather than leaving the line
                  // red while they are doing what it asked.
                  if (e.target.checked) setAgeMissing(false);
                }}
              />
              <span>I am 18 years of age or older</span>
            </label>

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
            Have an account already?{" "}
            {/* Goes straight to Google with no hint — a returning user picks
                their account rather than retyping an address we cannot check
                anyway. Not a route: there is no separate log-in page, because
                there is no separate log-in. */}
            <button
              type="button"
              onClick={() => {
                setError("");
                setBusy(true);
                startGoogle();
              }}
              disabled={busy}
              style={{
                background: "none",
                border: "none",
                padding: 0,
                font: "inherit",
                color: "var(--text)",
                textDecoration: "underline",
                cursor: busy ? "not-allowed" : "pointer",
              }}
            >
              Log in{" "}
              {/* The ↗ character (U+2197), not a drawn svg. Being real text it
                  inherits size, weight, colour and the underline automatically,
                  and needs no vertical nudging to sit on the line.

                  The gap is a real space in the text flow, NOT margin-left on
                  this span. A margin is outside the child's inline box, so the
                  underline breaks across it; a space is text, so it is
                  underlined like any other character and the rule stays
                  continuous through to the arrow. */}
              <span aria-hidden="true">↗</span>
            </button>
          </p>
        </div>
      </main>
    </div>
  );
}
