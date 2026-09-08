"use client";

/**
 * Friends — the tall card down the right of /home.
 *
 * It used to be a sidebar row and a route of its own, and that was the wrong
 * shape for it: /friends was a blank page you navigated TO in order to look at
 * a list, when the list is something you glance at while doing something else.
 * A rail beside the content is what a friends list is on every product that has
 * one. Losing the route also removes a nav item that led somewhere empty.
 *
 * A CARD, where the Inbox column opposite it is not. The rail holds discrete
 * objects set beside the content; the left column is one continuous list that
 * belongs to the page. See HomeBoard for that distinction in full.
 *
 * THE EMPTY STATE SPEAKS AS THE PRODUCT, NOT AS THE ROADMAP. It reads as a
 * friends list with nobody in it, which is what a reader can act on. That there
 * is no friends model at all — no table, no route, no concept of one user
 * knowing another outside a league — is the maintainer's business and is
 * written here rather than on the card.
 *
 * WHAT THIS NEEDS WHEN IT IS BUILT, per CLAUDE.md's sketch: a short unique code
 * per person, the way a league already has an invite code — which avoids a user
 * search, and so avoids letting anyone enumerate accounts by name or email.
 * Then add-by-code, invite-a-friend-into-a-league, and a decision about whether
 * a friend can see which leagues you are in (today that is visible only to
 * people already in the league).
 */

import { FriendsIcon } from "./NavIcons";

export default function FriendsCard() {
  return (
    <div className="hp-card is-rail">
      <div className="section-title hb-card-head">Friends</div>

      <div className="fr-empty">
        <span className="fr-mark"><FriendsIcon size={22} /></span>
        <p className="fr-lead">No friends yet</p>
      </div>
    </div>
  );
}
