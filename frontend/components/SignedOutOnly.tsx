"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthed } from "@/lib/auth";

/**
 * Sends signed-in users away from the routes that only make sense signed out.
 *
 * `/` and `/signup` are the two: a landing page selling the product, and a
 * sign-up form. Neither had any auth handling at all, so someone already
 * signed in could sit on a blank marketing page with "My account" in the bar
 * and nothing to do — the state showing one thing and the page another.
 *
 * The mirror of the guard in app/(user)/layout.tsx, which bounces signed-OUT
 * users off /home. Between them every route has an opinion about who it is for.
 *
 * WHY useAuthed AND NOT localStorage DIRECTLY
 *
 * Most guards in this app read `localStorage.getItem("token")` inside an effect.
 * That works once and then stops being true: it is not reactive, so signing out
 * in this tab or another leaves the guard un-re-run and the page sitting there.
 * useAuthed subscribes to AUTH_EVENT and `storage`, so this re-evaluates the
 * moment the token changes either way.
 *
 * `=== true`, never truthy. useAuthed returns null until it has checked, and
 * treating that as signed-in would redirect people who are not — the same class
 * of bug as the season countdown rendering for signed-in users, which came from
 * a check that did not distinguish "no" from "not known yet".
 *
 * `replace`, not `push`: a signed-in user pressing Back should not land on the
 * page that just bounced them and get bounced again.
 *
 * Renders nothing. Wrap it beside the page's content rather than around it —
 * the redirect is a side effect, and gating the content on it would blank the
 * page for signed-out visitors during the check.
 */
export default function SignedOutOnly({ to = "/home" }: { to?: string }) {
  const router = useRouter();
  const authed = useAuthed();

  useEffect(() => {
    if (authed === true) router.replace(to);
  }, [authed, router, to]);

  return null;
}
