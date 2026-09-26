import { cookies } from "next/headers";
import DocsFrame from "./DocsFrame";
import { DOCS_THEME_KEY } from "@/lib/docsTheme";

/**
 * THE THEME IS DECIDED HERE, ON THE SERVER, so the first paint is already right.
 *
 * It used to live in localStorage, which the server cannot see. The server
 * rendered dark for everyone and an effect corrected it after hydration — so a
 * reader who had chosen light got a dark frame and then light, and the version
 * before that (default light) flashed the other way. A cookie arrives with the
 * request, so the markup is correct before any script runs, in both directions.
 *
 * An absent cookie is dark: nobody has chosen, and dark is the docs default.
 * Only an explicit "light" turns it off.
 *
 * Reading cookies makes /docs render per request rather than prerender. These
 * are six short documents on a box we run ourselves, and that is the price of
 * a correct first paint.
 */
export default async function DocsLayout({ children }: { children: React.ReactNode }) {
  const initialDark = (await cookies()).get(DOCS_THEME_KEY)?.value !== "light";
  return <DocsFrame initialDark={initialDark}>{children}</DocsFrame>;
}
