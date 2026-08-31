import { permanentRedirect } from "next/navigation";

/**
 * The Privacy Policy moved under /docs. This stub is what keeps the old URL working.
 *
 * Linked from /signup alongside the terms and from the site footer, so it is bound into the same consent moment.
 *
 * permanentRedirect, not the useEffect stub /login and /register use: that
 * pattern needs JavaScript to run and renders a blank page first, which is the
 * wrong trade for an address that is linked from outside the app. This answers
 * 308 before anything renders.
 */
export default function Redirect() {
  permanentRedirect("/docs/privacy-policy");
}
