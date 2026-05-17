"use client";

import { getTeamLogoUrl } from "@/lib/teamLogos";

interface Props {
  team: string;
  size?: number;
  plain?: boolean;
}

export default function TeamLogo({ team, size = 40, plain = false }: Props) {
  const url = getTeamLogoUrl(team);

  if (!url) {
    return (
      <div style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background: "var(--surface-3)",
        border: "1px solid var(--border)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: size * 0.32,
        fontWeight: 800,
        color: "var(--text-2)",
        flexShrink: 0,
        letterSpacing: "-0.02em",
      }}>
        {team.substring(0, 2).toUpperCase()}
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt={team}
      width={size}
      height={size}
      style={{ objectFit: "contain", flexShrink: 0, ...(plain ? {} : { background: "var(--surface-3)", borderRadius: 6, padding: 2 }) }}
    />
  );
}
