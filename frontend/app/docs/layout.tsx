import { cookies } from "next/headers";
import DocsFrame from "./DocsFrame";
import { DOCS_THEME_KEY } from "@/lib/docsTheme";

// Theme is read from a cookie on the server so the first paint is already right.
export default async function DocsLayout({ children }: { children: React.ReactNode }) {
  const initialDark = (await cookies()).get(DOCS_THEME_KEY)?.value !== "light";
  return <DocsFrame initialDark={initialDark}>{children}</DocsFrame>;
}
