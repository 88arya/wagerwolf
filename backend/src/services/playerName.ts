export function playerNameKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/[.'`’-]/g, "")
    .replace(/\b(jr|sr|ii|iii|iv)\b/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}
