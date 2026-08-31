import { permanentRedirect } from "next/navigation";

/**
 * The legal index moved under /docs. This stub is what keeps the old URL working.
 *
 * It was only ever reachable from the sidebar's help menu, but it is one route rename away from being a dead link in anyone's history.
 *
 * permanentRedirect, not the useEffect stub /login and /register use: that
 * pattern needs JavaScript to run and renders a blank page first, which is the
 * wrong trade for an address that is linked from outside the app. This answers
 * 308 before anything renders.
 */
export default function Redirect() {
  permanentRedirect("/docs");
}
