// Lets the scheduler roll the week over early. CANCELLED blocks it, since ESPN
// postponements map to CANCELLED and resolving would void those bets.
// An empty week isn't finished.
export function allGamesFinal(games: ReadonlyArray<{ status: string }>): boolean {
  return games.length > 0 && games.every((g) => g.status === "FINAL");
}
