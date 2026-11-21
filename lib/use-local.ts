"use client";

/**
 * Per-browser JSON state in localStorage (ticked tasks, shopping prices). Renders the default on the server and
 * in private windows; storage errors are swallowed so the page still works.
 */
import { useCallback, useMemo, useSyncExternalStore } from "react";

const EVENT = "nsfl-local";
/** In-memory copy so ticks still work for this visit when storage is blocked. */
const mem = new Map<string, string>();

function read(key: string): string | null {
  try { return localStorage.getItem(key) ?? mem.get(key) ?? null; } catch { return mem.get(key) ?? null; }
}

export function useLocalJson<T>(key: string, fallback: T): [T, (next: T) => void] {
  const raw = useSyncExternalStore(
    (cb) => {
      window.addEventListener("storage", cb);
      window.addEventListener(EVENT, cb);
      return () => { window.removeEventListener("storage", cb); window.removeEventListener(EVENT, cb); };
    },
    () => read(key),
    () => null,
  );
  // `fallback` is a fresh literal each render; only the stored string should drive re-parsing.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const value = useMemo<T>(() => { try { return raw ? (JSON.parse(raw) as T) : fallback; } catch { return fallback; } }, [raw]);
  const set = useCallback((next: T) => {
    const str = JSON.stringify(next);
    mem.set(key, str);
    try { localStorage.setItem(key, str); } catch { /* storage blocked: the memory copy lasts for this visit */ }
    window.dispatchEvent(new Event(EVENT));
  }, [key]);
  return [value, set];
}
