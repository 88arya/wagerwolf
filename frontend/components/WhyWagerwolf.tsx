"use client";

import { useEffect, useRef, useState } from "react";
import Logo from "@/components/Logo";

const WALL = 3;
const TILES = WALL * WALL;
const CENTER = (TILES - 1) / 2;

const LOGOS = [
  { src: "/wall/espn-fantasy.png", name: "ESPN Fantasy", ar: 1.0563, ink: 1 },
  { src: "/wall/draftkings.png", name: "DraftKings", ar: 0.964, ink: 1 },
  { src: "/wall/sleeper.png", name: "Sleeper", ar: 0.8224, ink: 1 },
  { src: "/wall/fanduel.svg", name: "FanDuel", ar: 1.0033, ink: 0.5017 },
  /* centre: Wagerwolf */
  { src: "/wall/fanatics.png", name: "Fanatics", ar: 1.182, ink: 1 },
  { src: "/wall/nfl-fantasy.png", name: "NFL Fantasy", ar: 0.75, ink: 1 },
  { src: "/wall/betmgm.png", name: "BetMGM", ar: 0.748, ink: 1 },
  { src: "/wall/underdog.png", name: "Underdog", ar: 1.002, ink: 1 },
];

const MARK_H = 0.3607;
const MAX_W = 0.92;

function tileSize(ar: number, ink: number) {
  let h = MARK_H / ink;
  let w = h * ar;
  if (w > MAX_W) {
    w = MAX_W;
    h = w / ar;
  }
  return { width: `${(w * 100).toFixed(2)}%`, height: `${(h * 100).toFixed(2)}%` };
}

const MARK_AR = 58.62 / 72.1;

const DWELL = 7500;

const CLAIMS = [
  {
    claim: "Injuries can't ruin your season.",
    detail:
      "One injured star doesn't destroy months of work. Every week you build a new lineup from scratch.",
  },
  {
    claim: "No money at risk.",
    detail:
      "Use your virtual bankroll to compete without putting real money on the line. We never ask for a deposit.",
  },
  {
    claim: "No draft required.",
    detail:
      "Skip the hours of drafting, waiver wires, and roster management. Pick your bets and play.",
  },
];

export default function WhyWagerwolf() {
  const [open, setOpen] = useState(0);
  const [running, setRunning] = useState(false);
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const io = new IntersectionObserver(
      ([entry]) => setRunning(entry.isIntersecting),
      { threshold: 0.45 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!running) return;
    const id = setTimeout(
      () => setOpen((i) => (i + 1) % CLAIMS.length),
      DWELL,
    );
    return () => clearTimeout(id);
  }, [running, open]);

  return (
    <section className="lp-section is-why">
      <div className="why-head">
        <h2 className="lp-sec-title">
          Fantasy Football. Sportsbook.
          <span className="lp-sec-title-2">The best of both worlds.</span>
        </h2>
      </div>

      <div className="why-grid">
        <ul className="why-list" ref={listRef}>
          {CLAIMS.map(({ claim, detail }, i) => {
            const isOpen = i === open;
            return (
              <li className={`why-row${isOpen ? " is-open" : ""}`} key={claim}>
                <h3 className="why-claim-h">
                  <button
                    type="button"
                    className="why-claim"
                    onClick={() => setOpen(i)}
                    aria-expanded={isOpen}
                  >
                    {claim}
                  </button>
                </h3>
                {isOpen ? <p className="why-detail">{detail}</p> : null}
                {isOpen && running ? (
                  <span
                    className="why-progress"
                    style={{ animationDuration: `${DWELL}ms` }}
                  />
                ) : null}
              </li>
            );
          })}
        </ul>

        <div className="why-figure">
          <div
            className="why-wall"
            aria-hidden="true"
            style={{ ["--wall-n" as string]: WALL }}
          >
            {Array.from({ length: TILES }, (_, i) => (
              <span
                key={i}
                className={`why-tile${i === CENTER ? " is-brand" : ""}`}
                style={
                  i === CENTER
                    ? { ["--brand-h" as string]: tileSize(MARK_AR, 1).height }
                    : undefined
                }
              >
                {i === CENTER ? (
                  <Logo bare size={64} />
                ) : (
                  (() => {
                    const l = LOGOS[i < CENTER ? i : i - 1];
                    return (
                      <span
                        className="why-mark"
                        style={{
                          ...tileSize(l.ar, l.ink),
                          backgroundImage: `url("${l.src}")`,
                        }}
                      />
                    );
                  })()
                )}
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
