// Cookie (not localStorage) so the server can read it; scoped to /docs.
export const DOCS_THEME_KEY = "docs_theme";

export function writeDocsTheme(dark: boolean) {
  document.cookie =
    `${DOCS_THEME_KEY}=${dark ? "dark" : "light"}; path=/docs; max-age=31536000; samesite=lax`;
}
