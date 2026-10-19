export const OPPOSITE_MARKET: Record<string, string> = {
  MONEYLINE_HOME: "MONEYLINE_AWAY", MONEYLINE_AWAY: "MONEYLINE_HOME",
  SPREAD_HOME: "SPREAD_AWAY", SPREAD_AWAY: "SPREAD_HOME",
  TOTAL_OVER: "TOTAL_UNDER", TOTAL_UNDER: "TOTAL_OVER",
};

export const PROP_TABS = [
  { key: "qb", label: "Passing Props" },
  { key: "rushing", label: "Rushing Props" },
  { key: "receiving", label: "Receiving Props" },
  { key: "defense", label: "Defensive Props" },
  { key: "kicking", label: "Kicking Props" },
  { key: "other", label: "Other Props" },
];

export function propTab(statType: string): string {
  if (statType.startsWith("PASSING_")) return "qb";
  if (statType.startsWith("RUSHING_")) return "rushing";
  if (statType.startsWith("RECEIVING_") || statType === "RECEPTIONS") return "receiving";
  if (statType === "SACKS" || statType === "TACKLES_ASSISTS" || statType === "DEFENSIVE_INTERCEPTIONS") return "defense";
  if (statType.startsWith("FIELD_GOAL") || statType === "KICKING_POINTS" || statType === "EXTRA_POINTS_MADE") return "kicking";
  return "other";
}

export function fmtStatType(s: string): string {
  return s.split("_").map((w) => w[0] + w.slice(1).toLowerCase()).join(" ");
}

export function fmtSpread(n: number): string {
  return n > 0 ? `+${n}` : String(n);
}

export function fmtCountdown(dateStr: string): string {
  if (!dateStr) return "";
  const diffMs = new Date(dateStr).getTime() - Date.now();
  if (diffMs <= 0) return "Live";
  const totalHrs = Math.floor(diffMs / 3600000);
  const days = Math.floor(totalHrs / 24);
  const hrs = totalHrs % 24;
  if (days > 0) return `${days}d ${hrs}h`;
  if (hrs > 0) return `${hrs}h`;
  return "Soon";
}

export function fmtGameTime(dateStr: string): string {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  const weekday = d.toLocaleDateString("en-US", { weekday: "short" }).toUpperCase();
  let time: string;
  try {
    time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZoneName: "shortGeneric" });
  } catch {
    time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZoneName: "short" });
  }
  return `${weekday} ${time}`;
}
