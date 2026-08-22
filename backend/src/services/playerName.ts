/**
 * One canonical key for matching a player across sources that spell them
 * differently.
 *
 * Three feeds name the same person three ways: our own roster ("Deebo Samuel"),
 * ESPN's roster and box scores ("Deebo Samuel Sr."), and SharpAPI's odds
 * ("Deebo Samuel"). Generational suffixes and punctuation are where they
 * diverge — "A.J. Brown" / "AJ Brown", "Tyrone Tracy Jr." / "Tyrone Tracy".
 *
 * This is not cosmetic. Prop settlement looks the player up in the box score by
 * name, and a miss does not leave the prop pending — once the game has a box
 * score, an absent player is read as a DNP and the stat settles as 0. So a
 * suffix mismatch quietly grades every Over on that player as a loss.
 */
export function playerNameKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/[.'`’-]/g, "")
    .replace(/\b(jr|sr|ii|iii|iv)\b/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}
