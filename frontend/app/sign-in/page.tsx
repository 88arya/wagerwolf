/**
 * Sign in. Same body as /signup — components/AuthScreen — with a different
 * heading and a different line underneath.
 *
 * IT IS NOT A DIFFERENT MECHANISM. Google is the entire login surface, so this
 * screen does exactly what /signup does: takes an email as Google's `hint`,
 * opens the chooser, and hands the code to POST /users/auth/google. That
 * endpoint signs in an existing user and creates one if there is none, so a
 * visitor who lands here without an account still ends up with one rather than
 * hitting an error. The two pages differ in what they SAY, not in what happens.
 *
 * The route is `/sign-in`, hyphenated, while sign-up is `/signup`. That is an
 * inconsistency worth knowing about rather than a typo — it is the spelling
 * that was asked for. /login and /register are separate redirect stubs and are
 * unrelated to this page.
 */
import AuthScreen from "@/components/AuthScreen";

export default function SignInPage() {
  return (
    <AuthScreen
      heading="Welcome back"
      altPrompt="Don't have an account?"
      altLabel="Start here"
      altHref="/signup"
      // "By signing in" rather than "By continuing", which is what the sign-up
      // screen says. Only the verb changes: the sentence still forms the
      // agreement, because this page creates an account when there is none —
      // see the note on consentLead in AuthScreen.
      consentLead="By signing in, you agree to our"
    />
  );
}
