"use client";

import LeaguesRail from "@/components/LeaguesRail";

/**
 * The signed-in landing page.
 *
 * `/leagues` used to be a separate destination in the utility bar, and its
 * whole body was one wide table of the leagues you are in. That is now the
 * rail on the right — see components/LeaguesRail — and the table it used to be
 * opens from the rail's header. The route is gone; everything that pointed at
 * it points here.
 *
 * The main column is deliberately empty for now. It is the space a dashboard
 * will go into; leaving it blank is a decision, not an oversight, and it keeps
 * the rail the only thing on the page that has to be right.
 */
export default function HomePage() {
  return (
    <div className="page-wide" style={{ paddingTop: "5vh" }}>
      <div
        className="home-grid"
        style={{
          display: "grid",
          // Rail matches the league home's outer columns (270px) so the two
          // pages line up when you cross between them.
          gridTemplateColumns: "minmax(0, 1fr) 270px",
          gap: 28,
          alignItems: "start",
        }}
      >
        <div />
        <LeaguesRail />
      </div>
    </div>
  );
}
