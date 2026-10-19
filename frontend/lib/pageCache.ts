// Last-known data per page, so revisiting paints immediately and then
// revalidates. sessionStorage survives a reload; keys include the user id.
// getCached is memory-only and safe in render; readCached also reads storage
// and belongs in an effect, so hydration matches.
const PREFIX = "pc:";
const memory = new Map<string, unknown>();

function fullKey(key: string): string {
  const owner = typeof window !== "undefined" ? localStorage.getItem("userId") ?? "" : "";
  return `${PREFIX}${owner}:${key}`;
}

/** Memory only. Safe in render and in `useState` initialisers. */
export function getCached<T>(key: string): T | undefined {
  if (typeof window === "undefined") return undefined;
  return memory.get(fullKey(key)) as T | undefined;
}

/** Memory, then sessionStorage. Effects and handlers only - never in render. */
export function readCached<T>(key: string): T | undefined {
  const k = fullKey(key);
  if (memory.has(k)) return memory.get(k) as T;
  try {
    const raw = sessionStorage.getItem(k);
    if (raw == null) return undefined;
    const value = JSON.parse(raw) as T;
    memory.set(k, value);
    return value;
  } catch {
    return undefined;
  }
}

export function setCached<T>(key: string, value: T): void {
  const k = fullKey(key);
  memory.set(k, value);
  try { sessionStorage.setItem(k, JSON.stringify(value)); } catch {}
}

export function clearPageCache(): void {
  memory.clear();
  try {
    for (let i = sessionStorage.length - 1; i >= 0; i--) {
      const k = sessionStorage.key(i);
      if (k?.startsWith(PREFIX)) sessionStorage.removeItem(k);
    }
  } catch {}
}
