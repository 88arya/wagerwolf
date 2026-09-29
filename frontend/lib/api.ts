import { trackBoot } from "./bootGate";

const BASE = process.env.NEXT_PUBLIC_API_URL;

async function request(path: string, options?: RequestInit) {
  const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;

  const res = await fetch(`${BASE}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...options,
  });

  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

/**
 * Every request is visible to the shell's boot gate until it opens, so the
 * first paint can wait for the first data. See lib/bootGate.
 *
 * `gate: false` is for a request whose answer is already on screen from
 * lib/pageCache: the gate has nothing to wait for, and holding the shell behind
 * the bar for a refresh of data the person can already see would be the wait
 * the cache exists to remove.
 */
export function api(path: string, options?: RequestInit, { gate = true }: { gate?: boolean } = {}) {
  const req = request(path, options);
  return gate ? trackBoot(req) : req;
}
