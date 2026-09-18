import LogoWordmark from "@/components/LogoWordmark";

/**
 * THE SIGNED-IN APP IS DESKTOP ONLY, and this is the screen that says so.
 *
 * Rendered by AppFrame's shell branch — /home and every league route —
 * alongside the shell rather than instead of it. Which of the two is visible is
 * decided in CSS, by the `.mobile-gate` block in globals.css: the gate is
 * `display: none` by default and the shell is hidden below the breakpoint.
 *
 * WHY CSS AND NOT `window.innerWidth`.
 *
 * A JS width check cannot run during SSR, so the first paint would be the
 * layout the server guessed at and the correction would land a frame later —
 * either the app flashing up on a phone before the gate replaces it, or the
 * gate flashing on a desktop. A media query is resolved before the first paint
 * by the engine that already owns the answer, and it keeps following a window
 * being resized with no listener to wire up.
 *
 * WHAT IT DOES NOT DO. The shell is hidden, not unmounted, so the page behind
 * it still mounts and still fetches. This is a UX gate, not a security or cost
 * control — it exists because the league screens are laid out for a sidebar and
 * a wide card and read as broken on a phone, which is worse than being told
 * plainly to come back on a laptop.
 *
 * A FULL ACCENT GROUND, which no other screen in the app has. Everywhere else
 * the accent is reserved for the thing you click or the thing that is on — but
 * this is not a page inside the product, it is the product declining to open,
 * and a white page with a paragraph on it reads as a page that failed to load.
 * The blue says "this is deliberate" before the sentence is read.
 *
 * So the lockup is drawn `bare`: on an accent ground its own accent tile would
 * vanish into the fill, and `bare` hands both the head and the name to
 * `currentColor` — the same escape hatch the dark footer uses.
 */
export default function MobileGate() {
  return (
    <div className="mobile-gate">
      {/* Top left, not above the message. The lockup is a mark on a page here,
          not part of the centred block — the message is what the viewer reads
          and it sits on its own in the middle. */}
      <div className="mobile-gate-brand">
        <LogoWordmark height={30} bare />
      </div>
      <div className="mobile-gate-inner">
        {/* ONE SENTENCE, and "yet" is the whole of the coming-soon message —
            a paragraph promising a mobile version used to sit under this and
            said less than the adverb does. Nothing here dates the promise. */}
        <h1 className="mobile-gate-title">
          Sorry, Wagerwolf does not yet support mobile devices.
        </h1>
      </div>
    </div>
  );
}
