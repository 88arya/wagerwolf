"use client";

import { useEffect, useRef } from "react";
import { api } from "@/lib/api";

// PATCHes the device time zone whenever it differs from the stored one.
export function useTimeZoneSync(currentValue: string | null | undefined, enabled = true) {
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
