"use client";

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
