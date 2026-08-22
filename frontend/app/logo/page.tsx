// Logo and wordmark preview — not linked from anywhere in the app.
//
// The job of this page is CHOOSING A FACE for the wordmark. It renders the mark
// on its own first, then the wordmark as it currently ships, then every
// candidate in app/wordmarkFonts.ts stacked one under another so they can be
// compared directly rather than one at a time from memory.
//
// The stack only ever grows. A face that lost is still the reason the next one
// was tried, and the comparison is worth nothing if the losers are deleted —
// add to WORDMARK_FONTS, never replace.
//
// Every candidate is shown twice: large, where letterforms are legible, and at
// 20px on the dark utility bar, which is where the wordmark actually lives.
// The small one is the one that matters — every problem this lockup has had
// showed up at the small end, not the large one.
//
// Deliberately outside the (user) route group, and in AppChrome's NO_CHROME
// list, so there is no nav, no games strip and no auth gate — and no second
// wordmark in a bar above the specimens.
import Logo from "@/components/Logo";
import LogoWordmark from "@/components/LogoWordmark";
import { getAllTeams } from "@/lib/teamLogos";
import { WORDMARK_FONTS } from "../wordmarkFonts";

const LADDER = [64, 48, 32, 28, 20];

// A pangram — every letter of the alphabet — so one line exercises the whole
// lowercase and the capital T. Shown at two sizes because a display face can
// look fine set large and fall apart at running-text size, which is exactly the
// failure a wordmark face hides until it is used somewhere else.
const PANGRAM = "The quick brown fox jumps over the lazy dog.";
const PANGRAM_SIZES = [26, 15];

// Digits and signs matter more here than they would for most wordmarks: the
// app is wall-to-wall American odds, so a face that draws a weak + or an
// ambiguous - is a real problem, not a detail. Second line is the shape those
// actually take on a card.
const NUMERALS = "0123456789 + -";

// All 32, from the same source the app uses, so this sheet cannot fall out of
// step with what the strip actually renders.
const TEAM_ABBRS = getAllTeams().map(t => t.abbr.toUpperCase()).sort();

// GamesStrip's TEAM_ABBR, reproduced: 12px, weight 400, upright and 0.04em tracking. Matching it exactly is the point — anything else
// is not the comparison you want against the face already doing this job.
const STRIP_SIZE = 12;
const STRIP_SLANT = "normal";

// 700, which the live strip cannot do. Fugaz One ships exactly one cut, so its
// 400 was never a choice — asking for anything heavier would have had the
// browser fake a bold on top of an already-heavy display face. A candidate with
// real weights is not stuck there, so the sheet shows the weight worth judging
// rather than the one the incumbent is stranded on.
const STRIP_ABBR_WEIGHT = 700;
const ODDS_SAMPLE = "+162  -194  +330  -420  +1200  -110";

// Matches TopBar: BAR_H is 40 and the lockup inside it is 20.
const BAR_H = 40;
const BAR_LOCKUP_H = 20;

// The three ways the mark can sit against the name. mark-left is what ships.
const ARRANGEMENTS: Array<{ id: "mark-left" | "mark-right" | "mark-top"; label: string }> = [
  { id: "mark-left", label: "mark left — shipping" },
  { id: "mark-top", label: "mark above, centred" },
  { id: "mark-right", label: "mark right" },
];

const SWATCHES: Array<{ label: string; bg: string }> = [
  { label: "surface", bg: "var(--surface)" },
  { label: "page", bg: "var(--bg)" },
  { label: "near-black", bg: "var(--text)" },
];

function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section style={{ marginBottom: 72 }}>
      <div className="section-title" style={{ marginBottom: subtitle ? 6 : 20 }}>
        {title}
      </div>
      {subtitle && (
        <p style={{ margin: "0 0 22px", fontSize: "0.8rem", color: "var(--text-2)", maxWidth: 620 }}>
          {subtitle}
        </p>
      )}
      {children}
    </section>
  );
}

/** One candidate: the name large, then the same lockup at its shipping size. */
function Specimen({
  id,
  label,
  stack,
  weight,
  transform,
  align,
  markScale,
  teamAbbrevs,
  note,
  warn,
  index,
}: {
  id: string;
  label: string;
  stack: string;
  weight?: number;
  transform?: "lowercase" | "uppercase";
  align?: "center" | "baseline";
  markScale?: number | null;
  teamAbbrevs?: boolean;
  note: string;
  warn?: string;
  index: number;
}) {
  return (
    <div
      id={id}
      style={{
        borderTop: "1px solid var(--border)",
        padding: "28px 0 34px",
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 18 }}>
        <span className="eyebrow" style={{ color: "var(--text-3)" }}>
          {String(index + 1).padStart(2, "0")}
        </span>
        <span style={{ fontSize: "0.95rem", fontWeight: 500, color: "var(--text)" }}>{label}</span>
        <span className="eyebrow" style={{ color: "var(--text-3)" }}>weight {weight ?? 500}</span>
      </div>

      <p style={{ margin: "0 0 14px", fontSize: "0.78rem", color: "var(--text-2)", maxWidth: 620 }}>
        {note}
      </p>

      {/* A limitation of the face itself, not a note about it — kept visually
          distinct so it is not mistaken for taste. */}
      {warn && (
        <p
          style={{
            margin: "0 0 24px",
            padding: "8px 12px",
            fontSize: "0.78rem",
            color: "var(--loss)",
            background: "var(--loss-bg)",
            border: "1px solid var(--loss-border)",
            maxWidth: 620,
          }}
        >
          {warn}
        </p>
      )}

      {/* All three arrangements, same face, same size — so the choice of
          face and the choice of arrangement can be judged in one pass instead
          of two. */}
      <div style={{ display: "flex", gap: 24, flexWrap: "wrap", alignItems: "flex-start", marginBottom: 26 }}>
        {ARRANGEMENTS.map(a => (
          <div key={a.id} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <LogoWordmark
              height={64}
              layout={a.id}
              fontFamily={stack}
              fontWeight={weight}
              textTransform={transform}
              align={align ?? "center"}
              markScale={markScale ?? null}
            />
            <div className="eyebrow" style={{ color: "var(--text-3)" }}>{a.label}</div>
          </div>
        ))}
      </div>

      {/* At size, on the bar it actually ships in. `bare` draws head and name in
          currentColor, which is what TopBar does on this same fill. Takes the
          component's default arrangement — the app's real one — rather than a
          named layout, so this row always shows what the bar actually renders.

          `align` and `markScale` fall back to center / off for any candidate
          that does not state them: the component's defaults are Arca Majora's
          cap height and baseline, which mean nothing for another face. */}
      <div
        style={{
          background: "var(--bar-bg)",
          height: BAR_H,
          display: "flex",
          alignItems: "center",
          padding: "0 16px",
          color: "#FFFFFF",
          maxWidth: 460,
        }}
      >
        <LogoWordmark
          height={BAR_LOCKUP_H}
          bare
          fontFamily={stack}
          fontWeight={weight}
          textTransform={transform}
          align={align ?? "center"}
          markScale={markScale ?? null}
        />
      </div>
      <div className="eyebrow" style={{ marginTop: 8, color: "var(--text-3)" }}>
        utility bar — {BAR_LOCKUP_H}px lockup in a {BAR_H}px bar
      </div>

      {/* The face doing ordinary work. Drawn at the candidate's own weight and
          case, so this is the same treatment the lockup gets — not a neutral
          sample. For Lemon Milk that is the point: the sentence comes out in
          capitals, which is what having no lowercase actually costs. */}
      <div style={{ marginTop: 26 }}>
        <div className="eyebrow" style={{ color: "var(--text-3)", marginBottom: 10 }}>
          in a sentence
        </div>
        {PANGRAM_SIZES.map(size => (
          <p
            key={size}
            style={{
              margin: "0 0 10px",
              maxWidth: 720,
              fontFamily: stack,
              fontWeight: weight ?? 500,
              fontSize: size,
              lineHeight: 1.35,
              color: "var(--text)",
              ...(transform ? { textTransform: transform } : null),
            }}
          >
            {PANGRAM}
          </p>
        ))}

        <div className="eyebrow" style={{ color: "var(--text-3)", margin: "18px 0 10px" }}>
          numerals and signs
        </div>
        {[NUMERALS, ODDS_SAMPLE].map((line, i) => (
          <p
            key={line}
            style={{
              margin: "0 0 10px",
              maxWidth: 720,
              fontFamily: stack,
              fontWeight: weight ?? 500,
              fontSize: i === 0 ? 26 : 20,
              lineHeight: 1.35,
              color: "var(--text)",
              // Tabular, as the app sets numerals everywhere — it is the only
              // way to see whether a face's digits are the same width, which is
              // what stops a column of odds from shifting as scores update.
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {line}
          </p>
        ))}

        {teamAbbrevs && (
          <>
            <div className="eyebrow" style={{ color: "var(--text-3)", margin: "18px 0 10px" }}>
              team abbreviations — the games strip&rsquo;s job, currently Fugaz One
            </div>
            {[24, STRIP_SIZE].map(size => (
              <div
                key={size}
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: size === STRIP_SIZE ? "6px 14px" : "8px 20px",
                  maxWidth: 720,
                  marginBottom: 12,
                  fontFamily: stack,
                  fontWeight: STRIP_ABBR_WEIGHT,
                  fontStyle: STRIP_SLANT,
                  fontSize: size,
                  letterSpacing: "0.04em",
                  color: "var(--text)",
                }}
              >
                {TEAM_ABBRS.map(a => (
                  <span key={a}>{a}</span>
                ))}
              </div>
            ))}
            <div className="eyebrow" style={{ color: "var(--text-3)" }}>
              second row is {STRIP_SIZE}px — the size the strip actually uses
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default function LogoPreviewPage() {
  return (
    <div className="page-wide" style={{ paddingTop: 48, paddingBottom: 96 }}>
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        <h1 className="display-2" style={{ marginBottom: 8 }}>
          Logo
        </h1>
        <p className="lede" style={{ marginBottom: 56 }}>
          The mark on its own, the wordmark as it ships, and every face in the
          running for it. Candidates live in <code>app/wordmarkFonts.ts</code> —
          add to the list, never replace, so the comparison keeps its history.
        </p>

        {/* ── The mark alone ── */}
        <Section
          title="Mark — no wordmark"
          subtitle="components/Logo.tsx. Independent of whatever the name is set in."
        >
          <Logo size={360} />
        </Section>

        <Section title="Mark — size ladder">
          <div style={{ display: "flex", gap: 32, alignItems: "flex-end", flexWrap: "wrap" }}>
            {LADDER.map(s => (
              <div key={s} style={{ textAlign: "center" }}>
                <Logo size={s} />
                <div className="eyebrow" style={{ marginTop: 8 }}>
                  {s}
                </div>
              </div>
            ))}
          </div>
        </Section>

        {/* ── The wordmark as it ships ── */}
        <Section
          title="Wordmark — as it ships"
          subtitle="components/LogoWordmark.tsx, drawn exactly as the app draws it: no font override, so this is the real thing rather than a specimen."
        >
          <LogoWordmark height={132} />
        </Section>

        <Section title="Wordmark — size ladder">
          <div style={{ display: "flex", gap: 32, alignItems: "flex-end", flexWrap: "wrap" }}>
            {LADDER.map(s => (
              <div key={s} style={{ textAlign: "center" }}>
                <LogoWordmark height={s} />
                <div className="eyebrow" style={{ marginTop: 8 }}>
                  {s}
                </div>
              </div>
            ))}
          </div>
        </Section>

        <Section title="On the app's surfaces">
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
            {SWATCHES.map(({ label, bg }) => (
              <div
                key={label}
                style={{
                  background: bg,
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius)",
                  padding: 24,
                  display: "flex",
                  alignItems: "center",
                  gap: 20,
                  ...(label === "near-black" ? { color: "#FFFFFF" } : null),
                }}
              >
                <Logo size={40} bare={label === "near-black"} />
                <LogoWordmark height={28} bare={label === "near-black"} />
              </div>
            ))}
          </div>
        </Section>

        {/* ── The comparison this page exists for ── */}
        <Section
          title={`Wordmark — face candidates (${WORDMARK_FONTS.length})`}
          subtitle="Same lockup, same size, one face each. Two constants in LogoWordmark — WORDMARK_FONT_RATIO and OPTICAL_SHIFT_EM — are measured against Inter Tight and do not follow a swap, so a candidate may sit slightly high, low or large through no fault of its own. Judge letterforms, weight and width here; re-measure those two before adopting anything."
        >
          {WORDMARK_FONTS.map((f, i) => (
            <Specimen key={f.id} index={i} {...f} />
          ))}
        </Section>
      </div>
    </div>
  );
}
