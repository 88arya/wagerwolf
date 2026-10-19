"use client";

import { InboxIcon } from "./NavIcons";

export default function InboxColumn() {
  return (
    <section className="hb-left">
      <header className="hb-col-head">
        <h2 className="hb-col-title">Inbox</h2>
      </header>

      <div className="hb-col-body">
        <div className="fr-empty">
          <span className="fr-mark"><InboxIcon size={22} /></span>
          <p className="fr-lead">No new mail</p>
        </div>
      </div>
    </section>
  );
}
