/**
 * Sign up. The body — the email field, the Google call, the consent footnote —
 * lives in components/AuthScreen, shared with /sign-in.
 *
 * Read the notes there before changing how this screen behaves. In particular:
 * the email field does NOT create an account and cannot check whether an
 * address is registered. It is handed to Google as `hint`.
 *
 * NO `altHref` here, and that is the whole difference between the two screens.
 * The footer control on this one goes STRAIGHT TO GOOGLE rather than routing to
 * /sign-in: a returning user picks their account in Google's chooser instead of
 * retyping an address this app cannot verify. /sign-in exists as a URL to link
 * TO — from the landing nav — not as somewhere this page needs to send people.
 */
import AuthScreen from "@/components/AuthScreen";

export default function SignupPage() {
  return (
    <AuthScreen
      heading="Welcome to Wagerwolf"
      altPrompt="Have an account already?"
      altLabel="Log in"
    />
  );
}
