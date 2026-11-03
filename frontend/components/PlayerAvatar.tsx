"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { headshotUrl, sizedHeadshot } from "@/lib/espnImage";

interface Props {
  playerId?: string;
  espnId?: string | null;
  imageUrl?: string | null;
  name?: string;
  size?: number;
}

// The photo is zoomed 1.5x inside its box.
const ZOOM = 1.5;

export default function PlayerAvatar({ playerId, espnId, imageUrl: initialUrl, name, size = 48 }: Props) {
  const sized = (url: string | null | undefined) => (url ? sizedHeadshot(url, size * ZOOM) : null);
  const derived = espnId ? headshotUrl(espnId, size * ZOOM) : sized(initialUrl);
  const [imageUrl, setImageUrl] = useState(derived);
  const [failed, setFailed] = useState(false);
  const fetched = useRef(false);

  useEffect(() => {
    const next = espnId ? headshotUrl(espnId, size * ZOOM) : (initialUrl ? sizedHeadshot(initialUrl, size * ZOOM) : null);
    setImageUrl(next);
    setFailed(false);
    fetched.current = false;
  }, [espnId, initialUrl, size]);

  useEffect(() => {
    if (!imageUrl && !failed && playerId && !fetched.current) {
      fetched.current = true;
      api(`/players/${playerId}/image`)
        .then((d: { imageUrl?: string | null }) => { if (d?.imageUrl) setImageUrl(sizedHeadshot(d.imageUrl, size * ZOOM)); })
        .catch(() => {});
    }
  }, [imageUrl, failed, playerId, size]);

  const box: React.CSSProperties = { width: size, height: size, borderRadius: 6, flexShrink: 0, background: "var(--surface-3)" };

  if (imageUrl && !failed) {
    return (
      <div style={{ ...box, overflow: "hidden" }}>
        <img
          src={imageUrl}
          alt={name ?? ""}
          referrerPolicy="no-referrer"
          decoding="async"
          style={{ width: "100%", height: "100%", objectFit: "contain", transform: `scale(${ZOOM})`, transformOrigin: "center" }}
          onError={() => setFailed(true)}
        />
      </div>
    );
  }

  return (
    <div style={{
      ...box,
      display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: size * 0.32, fontWeight: 800, color: "var(--text-3)",
    }}>
      {name?.[0]?.toUpperCase() ?? "?"}
    </div>
  );
}
