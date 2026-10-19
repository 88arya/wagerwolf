"use client";

import { useEffect, useRef, useState } from "react";
import {
  HELMET_MARK_ID,
  HELMET_MARK_W,
  HELMET_MARK_H,
} from "@/components/HelmetMark";
import type { IconifyIcon } from "@iconify/react";
import { appAward, appHelmetFront } from "@/lib/icons";
import {
  WOLF_MARK,
  WOLF_MARK_X,
  WOLF_MARK_Y,
  WOLF_MARK_W,
  WOLF_MARK_H,
} from "@/components/Logo";

const W = 1220;
const H = 400;

const LABEL_GAP = 14;

const SEEDS_TOP = 90;

const SLOT_W = 160;
const SLOT_H = 56;

const SLOT_HELMET = 36;

const CHAMP = 130;

const GAP = (W - 6 * SLOT_W) / 5;

const PITCH = 78;

/** The four left seeds, top to bottom. */
const SEED_Y = [0, 1, 2, 3].map((i) => SEEDS_TOP + SLOT_H / 2 + i * PITCH);
const R1_Y = [(SEED_Y[0] + SEED_Y[1]) / 2, (SEED_Y[2] + SEED_Y[3]) / 2];
const R2_Y = (R1_Y[0] + R1_Y[1]) / 2;

const SEED_X = 0;
const R1_X = SEED_X + SLOT_W + GAP;
const R2_X = R1_X + SLOT_W + GAP;

const CHAMP_X = (W - CHAMP) / 2;
const CHAMP_Y = 36;

/** Mid-gap x for each elbow's vertical run. */
const JOIN_1 = SEED_X + SLOT_W + GAP / 2;
const JOIN_2 = R1_X + SLOT_W + GAP / 2;

const mirror = (x: number, w: number) => W - x - w;

/** A label's baseline, given the top of the column it names. */
const labelY = (columnTop: number) => columnTop - LABEL_GAP;

const YOU = "YOU";

const LEFT_SEEDS = [
  YOU,
  "Jonathan (Taylor's Version)",
  "CDs TDs",
  "When Diggs fly",
];
const RIGHT_SEEDS = [
  "Like a good Nabors",
  "Miracle on Rice",
  "Dak to the future",
  "CEA5E AND DE5I5T",
];

/** Winners, top pair then bottom pair. */
const LEFT_R1 = [YOU, "When Diggs fly"];
const RIGHT_R1 = ["Miracle on Rice", "Dak to the future"];
const LEFT_R2 = YOU;
const RIGHT_R2 = "Dak to the future";

const litLeg = (
  winner: string,
  topName: string,
  yTop: number,
  yBottom: number,
) => (winner !== YOU ? null : topName === winner ? yTop : yBottom);

// Scroll progress for each reveal stage; the last 20% holds the finished bracket.
const STAGE_AT = [0.08, 0.32, 0.56, 0.8];

type ChampionMark = {
  /** Iconify data, from lib/icons. */
  icon: IconifyIcon;
  /** How big to draw it, in BRACKET units. */
  size: number;
  crestH?: number;
  crestY?: number;
  /** Space between the artwork and the "YOU" under it, in bracket units. */
  gap: number;
  crestTone?: "silver" | "accent";
};

const MARKS = {
  award: { icon: appAward, size: 78, crestH: 215, crestY: 262, gap: 10 },

  helmetFront: { icon: appHelmetFront, size: 86, gap: 8, crestTone: "accent" },
} satisfies Record<string, ChampionMark>;

const ACTIVE: ChampionMark = MARKS.helmetFront;

const MARK_UNIT =
  ACTIVE.size / Math.max(ACTIVE.icon.width ?? 16, ACTIVE.icon.height ?? 16);
const CREST_H = (ACTIVE.crestH ?? 0) * MARK_UNIT;
const CREST_W = (CREST_H * WOLF_MARK_W) / WOLF_MARK_H;

const JOIN_DELAY = 0.28;
const SLOT_DELAY = 0.5;

export default function PlayoffReveal() {
  const trackRef = useRef<HTMLDivElement>(null);
  const pinRef = useRef<HTMLDivElement>(null);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const track = trackRef.current;
    const pin = pinRef.current;
    if (!track || !pin) return;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setProgress(1);
      return;
    }

    let raf = 0;
    const measure = () => {
      raf = 0;
      const cs = getComputedStyle(pin);

      // Narrow layouts unpin the section; show the bracket complete.
      if (cs.position !== "sticky") {
        setProgress(1);
        return;
      }

      const stickAt = parseFloat(cs.top) || 0;
      const rect = track.getBoundingClientRect();
      const span = rect.height - pin.getBoundingClientRect().height;
      if (span <= 1) {
        setProgress(1);
        return;
      }
      const p = (stickAt - rect.top) / span;
      setProgress(p < 0 ? 0 : p > 1 ? 1 : p);
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(measure);
    };

    measure();
    document.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    return () => {
      document.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  const on = (stage: number) => progress >= STAGE_AT[stage];

  return (
    <div className="pb-track" ref={trackRef}>
      <div className="pb-pin" ref={pinRef}>
        <div className="pb-head">
          <h2 className="lp-sec-title">
            Earn your spot in the playoffs.
            <span className="lp-sec-title-2">
              Then be crowned champion of your league.
            </span>
          </h2>
        </div>

        <svg
          className="pb-svg"
          viewBox={`0 0 ${W} ${H}`}
          role="img"
          aria-label="Playoff bracket: eight teams, a wildcard round, a championship round, then the Wagerbowl, won by you."
        >
          <Label x={SEED_X + SLOT_W / 2} y={labelY(SEEDS_TOP)} text="Wildcard" />
          <Label
            x={R1_X + SLOT_W / 2}
            y={labelY(R1_Y[0] - SLOT_H / 2)}
            text="Championship"
          />
          <Label
            x={R2_X + SLOT_W / 2}
            y={labelY(R2_Y - SLOT_H / 2)}
            text="Wagerbowl"
          />
          <Label
            x={mirror(R2_X, SLOT_W) + SLOT_W / 2}
            y={labelY(R2_Y - SLOT_H / 2)}
            text="Wagerbowl"
          />
          <Label x={W / 2} y={labelY(CHAMP_Y)} text="Champion" />

          <Label
            x={mirror(R1_X, SLOT_W) + SLOT_W / 2}
            y={labelY(R1_Y[0] - SLOT_H / 2)}
            text="Championship"
          />
          <Label
            x={mirror(SEED_X, SLOT_W) + SLOT_W / 2}
            y={labelY(SEEDS_TOP)}
            text="Wildcard"
          />

          {[0, 1].map((pair) => (
            <Elbow
              key={`l1-${pair}`}
              from={[SEED_X + SLOT_W, SEED_Y[pair * 2], SEED_Y[pair * 2 + 1]]}
              joinX={JOIN_1}
              to={[R1_X, R1_Y[pair]]}
              shown={on(1)}
              litY={litLeg(
                LEFT_R1[pair],
                LEFT_SEEDS[pair * 2],
                SEED_Y[pair * 2],
                SEED_Y[pair * 2 + 1],
              )}
            />
          ))}
          {[0, 1].map((pair) => (
            <Elbow
              key={`r1-${pair}`}
              from={[
                mirror(SEED_X, SLOT_W),
                SEED_Y[pair * 2],
                SEED_Y[pair * 2 + 1],
              ]}
              joinX={W - JOIN_1}
              to={[mirror(R1_X, SLOT_W) + SLOT_W, R1_Y[pair]]}
              shown={on(1)}
              litY={null}
            />
          ))}
          <Elbow
            from={[R1_X + SLOT_W, R1_Y[0], R1_Y[1]]}
            joinX={JOIN_2}
            to={[R2_X, R2_Y]}
            shown={on(2)}
            litY={litLeg(LEFT_R2, LEFT_R1[0], R1_Y[0], R1_Y[1])}
          />
          <Elbow
            from={[mirror(R1_X, SLOT_W), R1_Y[0], R1_Y[1]]}
            joinX={W - JOIN_2}
            to={[mirror(R2_X, SLOT_W) + SLOT_W, R2_Y]}
            shown={on(2)}
            litY={null}
          />
          <Run
            d={`M${R2_X + SLOT_W},${R2_Y} H${W / 2}`}
            shown={on(3)}
            lit={LEFT_R2 === YOU}
          />
          <Run
            d={`M${mirror(R2_X, SLOT_W)},${R2_Y} H${W / 2}`}
            shown={on(3)}
            lit={false}
          />
          <Run
            d={`M${W / 2},${R2_Y} V${CHAMP_Y + CHAMP}`}
            shown={on(3)}
            lit={LEFT_R2 === YOU}
            delay={JOIN_DELAY}
          />

          {LEFT_SEEDS.map((name, i) => (
            <Slot
              key={`ls-${i}`}
              x={SEED_X}
              y={SEED_Y[i] - SLOT_H / 2}
              w={SLOT_W}
              h={SLOT_H}
              name={name}
              shown={on(0)}
            />
          ))}
          {RIGHT_SEEDS.map((name, i) => (
            <Slot
              key={`rs-${i}`}
              x={mirror(SEED_X, SLOT_W)}
              y={SEED_Y[i] - SLOT_H / 2}
              w={SLOT_W}
              h={SLOT_H}
              name={name}
              shown={on(0)}
              flip
            />
          ))}
          {LEFT_R1.map((name, i) => (
            <Slot
              key={`l1s-${i}`}
              x={R1_X}
              y={R1_Y[i] - SLOT_H / 2}
              w={SLOT_W}
              h={SLOT_H}
              name={name}
              shown={on(1)}
              delay={SLOT_DELAY}
            />
          ))}
          {RIGHT_R1.map((name, i) => (
            <Slot
              key={`r1s-${i}`}
              x={mirror(R1_X, SLOT_W)}
              y={R1_Y[i] - SLOT_H / 2}
              w={SLOT_W}
              h={SLOT_H}
              name={name}
              shown={on(1)}
              delay={SLOT_DELAY}
              flip
            />
          ))}
          <Slot
            x={R2_X}
            y={R2_Y - SLOT_H / 2}
            w={SLOT_W}
            h={SLOT_H}
            name={LEFT_R2}
            shown={on(2)}
            delay={SLOT_DELAY}
          />
          <Slot
            x={mirror(R2_X, SLOT_W)}
            y={R2_Y - SLOT_H / 2}
            w={SLOT_W}
            h={SLOT_H}
            name={RIGHT_R2}
            shown={on(2)}
            delay={SLOT_DELAY}
            flip
          />

          <Champion shown={on(3)} delay={SLOT_DELAY} />
        </svg>

        <NarrowBracket />
      </div>
    </div>
  );
}

const ONE_LINE_MAX = 14;

function wrapName(name: string): string[] {
  if (name.length <= ONE_LINE_MAX) return [name];
  const words = name.split(" ");
  if (words.length < 2) return [name];

  let best = [name];
  let bestScore = Infinity;
  for (let i = 1; i < words.length; i++) {
    const parts = [words.slice(0, i).join(" "), words.slice(i).join(" ")];
    const score = Math.max(parts[0].length, parts[1].length);
    if (score < bestScore) {
      bestScore = score;
      best = parts;
    }
  }
  return best;
}

// Iconify's <Icon> renders a <span> before mount, which draws nothing inside an
// <svg>, so render the icon data into a nested <svg> instead.
function SvgIcon({
  icon,
  x,
  y,
  size,
  className,
}: {
  icon: IconifyIcon;
  x: number;
  y: number;
  size: number;
  className?: string;
}) {
  return (
    <svg
      className={className}
      x={x}
      y={y}
      width={size}
      height={size}
      viewBox={`0 0 ${icon.width} ${icon.height}`}
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: icon.body }}
    />
  );
}

function Crest({
  cx,
  cy,
  tone = "silver",
}: {
  cx: number;
  cy: number;
  tone?: "silver" | "accent";
}) {
  const s = CREST_H / WOLF_MARK_H;
  return (
    <g
      className={tone === "accent" ? "pb-crest is-accent" : "pb-crest"}
      transform={`translate(${cx - CREST_W / 2 - WOLF_MARK_X * s},${cy - CREST_H / 2 - WOLF_MARK_Y * s}) scale(${s})`}
    >
      <path fillRule="evenodd" d={WOLF_MARK} />
    </g>
  );
}

/*  PIECES */

function Label({ x, y, text }: { x: number; y: number; text: string }) {
  return (
    <text className="pb-label" x={x} y={y} textAnchor="middle">
      {text}
    </text>
  );
}

function Slot({
  x,
  y,
  w,
  h,
  name,
  shown,
  delay = 0,
  flip = false,
}: {
  x: number;
  y: number;
  w: number;
  h: number;
  name: string;
  shown: boolean;
  delay?: number;
  flip?: boolean;
}) {
  const you = name === YOU;
  const pad = 9;
  const helmetH = SLOT_HELMET / (HELMET_MARK_W / HELMET_MARK_H);
  const helmetX = flip ? x + w - pad - SLOT_HELMET : x + pad;

  const colStart = flip ? x + pad : helmetX + SLOT_HELMET + pad;
  const colEnd = flip ? helmetX - pad : x + w - pad;
  const textX = (colStart + colEnd) / 2;

  const hold = delay ? { transitionDelay: `${delay}s` } : undefined;
  const lines = wrapName(name);
  const cy = y + h / 2;
  const LINE_H = 15;

  return (
    <g className={`pb-slot${shown ? " is-on" : ""}${you ? " is-you" : ""}`}>
      <rect
        className="pb-slot-empty"
        style={hold}
        x={x}
        y={y}
        width={w}
        height={h}
        rx={8}
      />
      <g className="pb-slot-full" style={hold}>
        <rect x={x} y={y} width={w} height={h} rx={8} />
        <Helmet
          x={helmetX}
          y={cy - helmetH / 2}
          w={SLOT_HELMET}
          flip={flip}
        />
        {lines.map((line, i) => (
          <text
            key={i}
            className="pb-name"
            x={textX}
            y={cy + (i - (lines.length - 1) / 2) * LINE_H}
            textAnchor="middle"
            dominantBaseline="central"
          >
            {line}
          </text>
        ))}
      </g>
    </g>
  );
}

function Champion({
  shown,
  delay = 0,
  x = CHAMP_X,
  y = CHAMP_Y,
}: {
  shown: boolean;
  delay?: number;
  x?: number;
  y?: number;
}) {
  const hold = delay ? { transitionDelay: `${delay}s` } : undefined;
  const nameH = 20;

  const crestY = ACTIVE.crestY ?? 0;
  const crestH = ACTIVE.crestH ?? 0;
  const artTop = Math.min(0, crestY - crestH / 2);
  const artBottom = Math.max(
    ACTIVE.icon.height ?? 16,
    crestY + crestH / 2,
  );
  const artH = (artBottom - artTop) * MARK_UNIT;

  const stackTop = y + (CHAMP - (artH + ACTIVE.gap + nameH)) / 2;
  const artY = stackTop - artTop * MARK_UNIT;
  return (
    <g className={`pb-champ${shown ? " is-on" : ""}`}>
      <rect
        className="pb-slot-empty"
        style={hold}
        x={x}
        y={y}
        width={CHAMP}
        height={CHAMP}
        rx={12}
      />
      <g className="pb-champ-full" style={hold}>
        <rect x={x} y={y} width={CHAMP} height={CHAMP} rx={12} />
        <SvgIcon
          className="pb-champ-award"
          icon={ACTIVE.icon}
          x={x + (CHAMP - ACTIVE.size) / 2}
          y={artY}
          size={ACTIVE.size}
        />
        {ACTIVE.crestH ? (
          <Crest
            cx={x + CHAMP / 2}
            cy={artY + crestY * MARK_UNIT}
            tone={ACTIVE.crestTone}
          />
        ) : null}
        <text
          className="pb-champ-name"
          x={x + CHAMP / 2}
          y={stackTop + artH + ACTIVE.gap + nameH / 2}
          textAnchor="middle"
          dominantBaseline="central"
        >
          {YOU}
        </text>
      </g>
    </g>
  );
}

function Helmet({
  x,
  y,
  w,
  flip = false,
}: {
  x: number;
  y: number;
  w: number;
  flip?: boolean;
}) {
  const s = w / HELMET_MARK_W;
  const t = flip
    ? `translate(${x + w},${y}) scale(${-s},${s})`
    : `translate(${x},${y}) scale(${s})`;
  return (
    <g transform={t}>
      <use href={`#${HELMET_MARK_ID}`} />
    </g>
  );
}

function Elbow({
  from,
  joinX,
  to,
  shown,
  litY,
}: {
  from: [number, number, number];
  joinX: number;
  to: [number, number];
  shown: boolean;
  litY: number | null;
}) {
  const [edge, yA, yB] = from;
  const [toX, toY] = to;
  const leg = (y: number) => `M${edge},${y} H${joinX} V${toY}`;
  return (
    <>
      <Run d={leg(yA)} shown={shown} lit={false} />
      <Run d={leg(yB)} shown={shown} lit={false} />
      {litY !== null && <Run d={leg(litY)} shown={shown} lit />}
      <Run
        d={`M${joinX},${toY} H${toX}`}
        shown={shown}
        lit={litY !== null}
        delay={JOIN_DELAY}
      />
    </>
  );
}

function Run({
  d,
  shown,
  lit,
  delay = 0,
}: {
  d: string;
  shown: boolean;
  lit: boolean;
  delay?: number;
}) {
  return (
    <path
      className={`pb-run${shown ? " is-on" : ""}${lit ? " is-lit" : ""}`}
      style={delay ? { transitionDelay: `${delay}s` } : undefined}
      d={d}
      pathLength={1}
    />
  );
}

const NW = 2 * SLOT_W + 40;

/** One round's pitch: its label, its two cards, and the air under them. */
const N_BLOCK = 118;
/** Top of a round's cards, below its label. */
const N_CARD_TOP = 24;
/** Where the champion's card starts: below the three rounds, plus its label. */
const N_CHAMP_Y = 3 * N_BLOCK + 20;
const N_HEIGHT = N_CHAMP_Y + CHAMP + 4;

const N_LEFT_X = 0;
const N_RIGHT_X = NW - SLOT_W;
/** The middle of the gap between the two cards, where "vs" sits. */
const N_MID_X = NW / 2;

const N_ROUNDS = [
  { label: "Wildcard", opponent: LEFT_SEEDS[1] },
  { label: "Championship", opponent: LEFT_R1[1] },
  { label: "Wagerbowl", opponent: RIGHT_R2 },
];

function NarrowBracket() {
  return (
    <svg
      className="pb-svg-narrow"
      viewBox={`0 0 ${NW} ${N_HEIGHT}`}
      role="img"
      aria-label="Your playoff run: you win the wildcard round, the championship round and the Wagerbowl, and are crowned champion."
    >
      {N_ROUNDS.map((round, i) => {
        const top = i * N_BLOCK;
        const cardY = top + N_CARD_TOP;
        return (
          <g key={round.label}>
            <Label x={N_MID_X} y={labelY(cardY)} text={round.label} />
            <Slot x={N_LEFT_X} y={cardY} w={SLOT_W} h={SLOT_H} name={YOU} shown />
            <Slot
              x={N_RIGHT_X}
              y={cardY}
              w={SLOT_W}
              h={SLOT_H}
              name={round.opponent}
              shown
              flip
            />
            <text
              className="pb-label"
              x={N_MID_X}
              y={cardY + SLOT_H / 2}
              textAnchor="middle"
              dominantBaseline="central"
            >
              vs
            </text>
          </g>
        );
      })}

      <Label x={N_MID_X} y={labelY(N_CHAMP_Y)} text="Champion" />
      <Champion shown x={(NW - CHAMP) / 2} y={N_CHAMP_Y} />
    </svg>
  );
}
