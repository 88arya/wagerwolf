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
