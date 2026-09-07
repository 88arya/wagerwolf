/**
 * The 404, and the reason it exists is credibility rather than routing.
 *
 * Without this file a bad URL renders Next's default page — an unstyled black
 * "404 | This page could not be found" that reads as the application being
 * broken rather than as the address being wrong. It is the cheapest possible
 * fix for that impression and it is the same one for `error.tsx` next door.
 *
 * Built from `.mx-*` rather than `.card`, so it matches the chrome around it.
 * `AppFrame` still draws that chrome — a not-found inside `app/` renders in the
 * root layout — so this is only the column's contents.
 */
import Link from "next/link";

export default function NotFound() {
  return (
    <div className="page-wide">
      <div className="mx-head">
        <div className="eyebrow">Error 404</div>
        <h1 className="mx-title">This page does not exist</h1>
      </div>
      <p style={{ color: "var(--text-2)", maxWidth: "44ch", marginBottom: 24 }}>
        The address may have changed, or the league it pointed at may have been
        deleted.
      </p>
      <Link className="mx-btn is-primary" href="/home">
        Go to your home page
      </Link>
    </div>
  );
}
