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

  const circle: React.CSSProperties = { width: size, height: size, borderRadius: "50%", flexShrink: 0 };

  if (imageUrl && !failed) {
    return (
      <img
        src={imageUrl}
        alt={name ?? ""}
        style={{ ...circle, objectFit: "cover", background: "var(--surface-2)" }}
        onError={() => setFailed(true)}
      />
    );
  }

  return (
    <div style={{
      ...circle,
      background: "var(--surface-2)", border: "1px solid var(--border)",
      display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: size * 0.23, fontWeight: 800, color: "var(--text-3)",
    }}>
      {name?.[0] ?? "?"}
    </div>
  );
}
