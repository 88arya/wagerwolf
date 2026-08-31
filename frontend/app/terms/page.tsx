import { permanentRedirect } from "next/navigation";

/**
 * Terms of Service moved under /docs. This stub is what keeps the old URL working.
 *
 * THE MOST LOAD-BEARING OF THE FIVE. /signup's footnote binds the user to these terms on Continue, and the 18+ requirement lives in their first paragraph — CLAUDE.md records that sentence as the only place the age gate now exists. A dead /terms breaks a consent flow, not just a link.
 *
 * permanentRedirect, not the useEffect stub /login and /register use: that
 * pattern needs JavaScript to run and renders a blank page first, which is the
 * wrong trade for an address that is linked from outside the app. This answers
 * 308 before anything renders.
 */
export default function Redirect() {
  permanentRedirect("/docs/terms-of-service");
}
