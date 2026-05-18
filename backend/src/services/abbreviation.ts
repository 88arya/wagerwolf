export function generateAbbreviation(displayName: string): string {
  const word = displayName.trim().replace(/[^A-Za-z]/g, "").toUpperCase();
  if (word.length >= 3) return word.slice(0, 3);
  if (word.length === 2) return word;
  const ch = word[0] ?? "P";
  return ch + ch + ch;
}
