import { permanentRedirect } from "next/navigation";

/**
 * Responsible Gaming moved under /docs. This stub is what keeps the old URL working.
 *
 * Linked from the site footer and from /contact. It also carries the helpline, which is the one thing here somebody might have bookmarked.
 *
 * permanentRedirect, not the useEffect stub /login and /register use: that
 * pattern needs JavaScript to run and renders a blank page first, which is the
 * wrong trade for an address that is linked from outside the app. This answers
 * 308 before anything renders.
 */
export default function Redirect() {
  permanentRedirect("/docs/responsible-gaming");
}
