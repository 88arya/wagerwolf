import { permanentRedirect } from "next/navigation";

/**
 * How to Play moved under /docs. This stub is what keeps the old URL working.
 *
 * Linked from the site footer and from /contact's copy.
 *
 * permanentRedirect, not the useEffect stub /login and /register use: that
 * pattern needs JavaScript to run and renders a blank page first, which is the
 * wrong trade for an address that is linked from outside the app. This answers
 * 308 before anything renders.
 */
export default function Redirect() {
  permanentRedirect("/docs/how-to-play");
}
