"use client";

import { useLayoutEffect, useRef } from "react";
import { isBooted } from "@/lib/bootGate";

/**
 * The loading bar, full screen and centred, shared by /auth/callback and the
 * shell's first load (AppFrame).
 *
 * WHY ONE COMPONENT. Sign-in shows the bar on /auth/callback, then replaces to
 * /home, where the shell shows the bar again while its first data loads. They
 * were two differently placed elements: the callback centred its bar under its
 * own header and the shell centred on the viewport, so the bar visibly jumped
 * up, and the second one's fill started again from empty. Read as two loads.
 *
 * Same box (`.boot-screen`), so the position is identical. And the fill
 * CONTINUES: the first bar to mount in a loading sequence records when it
 * started, and every later bar sets a negative animation-delay of the time
 * since, so its fill picks up where the previous bar's left off. A layout
 * effect, so the delay is applied before the new bar's first paint and there
 * is no frame of an empty bar.
 *
 * THE START IS READ OFF THE ANIMATION, NOT THE CLOCK AT MOUNT. The callback
 * is a full page load from Google, so its bar is server rendered and starts
 * filling on first paint, long before this effect runs on hydration (half a
 * second or more in dev). Recording `now` at mount put the start too late, so
 * the shell's bar picked up BEHIND the callback's and the fill visibly went
 * back before going forward again. The first bar therefore asks the browser
 * how far its own animation has run (`getAnimations`, which with `subtree`
 * includes the ::before that carries it) and dates the start from that.
 *
 * THE SEQUENCE ENDS WHEN THE SHELL IS REVEALED, i.e. when the last bar unmounts
 * with lib/bootGate open. Not on a timer: the callback's bar can unmount before
 * the shell's mounts if the route switch is slow, and a timer that fired in
 * that gap reset the clock and restarted the fill from empty. An error on the
 * callback also leaves it running, which is harmless: trying again goes to
 * Google, a full page load, which starts the module over.
 */

let startedAt: number | null = null;
let mounted = 0;
// The bar whose own animation dated the sequence. It must never be given an
// offset: in dev, strict mode runs this effect twice on the same element, and
// offsetting the bar that set the clock would jump its fill forward.
const clockOwners = new WeakSet<Element>();

export default function LoadingBar({
  label,
  className = "",
}: {
  label: string;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    const now = performance.now();
    if (startedAt === null) {
      // How far this bar's own fill has already run: non-zero when it was
      // server rendered and has been animating since first paint.
      const run = el?.getAnimations({ subtree: true })[0]?.currentTime;
      startedAt = now - (typeof run === "number" ? run : 0);
      if (el) clockOwners.add(el);
    } else if (el && !clockOwners.has(el)) {
      el.style.setProperty("--signin-elapsed", `${-(now - startedAt)}ms`);
    }
    mounted++;
    return () => {
      mounted--;
      if (mounted === 0 && isBooted()) startedAt = null;
    };
  }, []);

  return (
    <div className={`boot-screen ${className}`.trim()}>
      <div ref={ref} className="signin-bar" role="progressbar" aria-label={label} />
    </div>
  );
}
