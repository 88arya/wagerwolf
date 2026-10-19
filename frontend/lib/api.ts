import { trackBoot } from "./bootGate";

const BASE = process.env.NEXT_PUBLIC_API_URL;

async function request<T>(path: string, options?: RequestInit): Promise<T> {
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

// Requests are tracked by the boot gate until it opens. Pass gate: false when
// the data is already on screen from the page cache.
// T defaults to any so untyped call sites keep working; pass a type where the shape matters.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function api<T = any>(path: string, options?: RequestInit, { gate = true }: { gate?: boolean } = {}): Promise<T> {
  const req = request<T>(path, options);
  return gate ? trackBoot(req) : req;
}

// Error responses are JSON like { error: "..." }; otherwise use the fallback or raw text.
export function apiError(err: unknown, fallback?: string): string {
  const message = err instanceof Error ? err.message : String(err);
  try {
    const parsed = JSON.parse(message).error;
    if (parsed) return parsed;
  } catch {}
  return fallback ?? message;
}
