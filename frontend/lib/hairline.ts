"use client";

import { useEffect, useState } from "react";

export function useDevicePixelRatio() {
  const [dpr, setDpr] = useState(1);

  useEffect(() => {
    const update = () => setDpr(window.devicePixelRatio || 1);
    update();
    const mq = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
    mq.addEventListener("change", update);
    window.addEventListener("resize", update);
    return () => {
      mq.removeEventListener("change", update);
      window.removeEventListener("resize", update);
    };
  }, [dpr]);

  return dpr;
}

// Round to whole device pixels so thin lines stay crisp at fractional scaling.
export function snapToDevicePx(cssPx: number, dpr: number) {
  return Math.max(1, Math.round(cssPx * dpr)) / dpr;
}
