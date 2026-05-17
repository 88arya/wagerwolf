export function generateAbbreviation(displayName: string): string {
  const parts = displayName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "PL";
  if (parts.length >= 2) {
    const abr = parts.slice(0, 3).map(p => p[0].toUpperCase()).join("");
    return abr.length >= 2 ? abr : abr + abr[0];
  }
  const word = parts[0].replace(/[^A-Za-z]/g, "").toUpperCase();
  if (word.length >= 2) return word.slice(0, 3);
  const ch = word[0] ?? "P";
  return ch + ch;
}
