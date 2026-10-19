"use client";

import { useLayoutEffect, useRef } from "react";
import { isBooted } from "@/lib/bootGate";

let startedAt: number | null = null;
let mounted = 0;
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
