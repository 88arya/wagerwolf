import AuthScreen from "@/components/AuthScreen";

export default function SignInPage() {
  return (
    <AuthScreen
      heading="Welcome back"
      altPrompt="Don't have an account?"
      altLabel="Start here"
      altHref="/signup"
      consentLead="By signing in, you agree to our"
    />
  );
}
