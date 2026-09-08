"use client";

/**
 * Inbox — the left column of /home.
 *
 * A COLUMN, NOT A CARD, and that distinction is the whole point of the layout:
 * a list you scan down is a region of the page, and boxing it draws a border
 * around something that already has an edge. The vertical hairline between it
 * and the centre is all the separation it needs. The right rail is carded
 * because those are discrete objects sitting beside the content; this is one
 * continuous list that belongs to the page.
 *
 * It briefly had its own route (/inbox) and its own sidebar row. Both are gone:
 * a nav item that leads to a blank page is worse than no nav item, and an inbox
 * is something you keep an eye on while doing something else rather than a
 * place you travel to.
 *
 * THE EMPTY STATE SPEAKS AS THE PRODUCT, NOT AS THE ROADMAP. It reads as an
 * inbox with nothing in it, because that is what a reader can act on; "there is
 * no message model yet" is true and is the maintainer's business, which is why
 * it is written here instead. There IS no message model — no table, no route,
 * no decision about what a message even is — so this state is currently the
 * only one that renders.
 *
 * The nearest existing things — the per-league feed, chat and the weekly recap
 * — are all league-scoped. An inbox would be the first surface addressed to a
 * person rather than to a league, which is the actual design question behind
 * it, not the rendering.
 *
 * The mark comes from NavIcons, where it was parked when the route came off.
 */

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
