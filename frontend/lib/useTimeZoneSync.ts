"use client";

import { useEffect, useRef } from "react";
import { api } from "@/lib/api";

/**
 * Keeps `User.timeZone` matching the device.
 *
 * The time zone is the one piece of location the app stores, and it is a fact
 * rather than a preference — the browser already knows it, exactly, and hands it
 * out to any script that asks with no permission prompt. So there is no field
 * for it anywhere: this reads it and writes it, and My Account shows the result
 * read-only beside the other derived values.
 *
 * SYNCED, NOT CAPTURED ONCE. The age confirmation is stamped at sign-up and never
 * again; a zone is not like that. People travel, move, and occasionally fix a
 * wrong OS setting, and a value captured at signup would quietly rot. Comparing
 * on every mount costs one PATCH on the rare load where it actually differs.
 *
 * Nothing needs this to render a kickoff time — the bet page and the games strip
 * both format in the viewer's own zone with no server input. It exists for the
 * case with no browser in the loop: notifications that should arrive at a
 * reasonable local hour.
 *
 * Failures are swallowed. A zone that did not sync is worth nothing to interrupt
 * anybody over, and the next page load tries again.
 */
export function useTimeZoneSync(currentValue: string | null | undefined, enabled = true) {
  // One attempt per mount even under StrictMode's double-invoke, and no repeat
  // when the parent re-renders with the same value.
  const sent = useRef<string | null>(null);

  useEffect(() => {
    if (!enabled) return;
    if (typeof Intl === "undefined") return;

    let zone = "";
    try {
      zone = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
    } catch {
      return;
    }
    if (!zone || zone === currentValue || sent.current === zone) return;

    sent.current = zone;
    api("/users/me", { method: "PATCH", body: JSON.stringify({ timeZone: zone }) }).catch(() => {});
  }, [currentValue, enabled]);
}
