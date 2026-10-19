// The only User fields other players may see. Used in relational queries'
// `columns` so private fields are never selected in the first place.
export const PUBLIC_USER_COLUMNS = {
  id: true,
  displayName: true,
} as const;

/** Ready to spread into a relational query: `with: { user: PUBLIC_USER }`. */
export const PUBLIC_USER = { columns: PUBLIC_USER_COLUMNS } as const;

export type PublicUser = { id: string; displayName: string };
