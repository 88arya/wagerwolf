"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";

interface Props {
  playerId?: string;
  espnId?: string | null;
  imageUrl?: string | null;
  name?: string;
  size?: number;
}

function espnImageUrl(espnId: string) {
  return `https://a.espncdn.com/i/headshots/nfl/players/full/${espnId}.png`;
}

export default function PlayerAvatar({ playerId, espnId, imageUrl: initialUrl, name, size = 48 }: Props) {
  const derived = espnId ? espnImageUrl(espnId) : (initialUrl ?? null);
  const [imageUrl, setImageUrl] = useState(derived);
  const [failed, setFailed] = useState(false);
  const fetched = useRef(false);

  useEffect(() => {
    const next = espnId ? espnImageUrl(espnId) : (initialUrl ?? null);
    setImageUrl(next);
    setFailed(false);
    fetched.current = false;
  }, [espnId, initialUrl]);

  useEffect(() => {
    if (!imageUrl && !failed && playerId && !fetched.current) {
      fetched.current = true;
      api(`/players/${playerId}/image`)
        .then((d: any) => { if (d?.imageUrl) setImageUrl(d.imageUrl); })
        .catch(() => {});
    }
  }, [imageUrl, failed, playerId]);

  const box: React.CSSProperties = { width: size, height: size, borderRadius: 6, flexShrink: 0, background: "var(--surface-3)" };

  if (imageUrl && !failed) {
    return (
      <div style={{ ...box, overflow: "hidden" }}>
        <img
          src={imageUrl}
          alt={name ?? ""}
          referrerPolicy="no-referrer"
          style={{ width: "100%", height: "100%", objectFit: "contain", transform: "scale(1.5)", transformOrigin: "center" }}
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
