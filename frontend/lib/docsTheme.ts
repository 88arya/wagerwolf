/**
 * The docs section's theme preference: a COOKIE, not localStorage, so the
 * server can render the right theme on the first paint. See app/docs/layout.tsx.
 *
 * Not "theme": the app has no global dark mode and this must not read as one.
 * Scoped to path=/docs so it is only ever sent to the routes that use it.
 *
 * Its own module rather than an export of DocsShell because the layout reading
 * it is a server component, and a value imported from a "use client" file
 * arrives there as a client reference rather than as the string.
 */
export const DOCS_THEME_KEY = "docs_theme";

export function writeDocsTheme(dark: boolean) {
  document.cookie =
    `${DOCS_THEME_KEY}=${dark ? "dark" : "light"}; path=/docs; max-age=31536000; samesite=lax`;
}
