"use client";

import { GoogleOAuthProvider } from "@react-oauth/google";

const CLIENT_ID = "1045849865095-o31t34rfsiidk50ep1shaf0nctni7sno.apps.googleusercontent.com";

export default function GoogleProvider({ children }: { children: React.ReactNode }) {
  return <GoogleOAuthProvider clientId={CLIENT_ID}>{children}</GoogleOAuthProvider>;
}
