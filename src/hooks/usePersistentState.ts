import { useEffect, useRef, useState, Dispatch, SetStateAction } from "react";

/**
 * usePersistentState
 *
 * Drop-in replacement for useState that mirrors the value to localStorage.
 * On mount it hydrates from storage so user inputs survive:
 *   - tab switches / window blur
 *   - accidental navigation away and back
 *   - browser refresh
 *   - temporary background process interruptions
 *
 * Writes are debounced to avoid spamming localStorage on every keystroke.
 */
export function usePersistentState<T>(
  key: string,
  initialValue: T,
  options: { debounceMs?: number; version?: number } = {}
): [T, Dispatch<SetStateAction<T>>, () => void] {
  const { debounceMs = 300, version = 1 } = options;
  const storageKey = `lovable.persist.v${version}.${key}`;

  const [state, setState] = useState<T>(() => {
    if (typeof window === "undefined") return initialValue;
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (raw == null) return initialValue;
      const parsed = JSON.parse(raw);
      return parsed as T;
    } catch {
      return initialValue;
    }
  });

  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      try {
        window.localStorage.setItem(storageKey, JSON.stringify(state));
      } catch {
        // quota exceeded or serialization error — silently ignore
      }
    }, debounceMs);
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [state, storageKey, debounceMs]);

  // Flush pending write before unload so data isn't lost
  useEffect(() => {
    if (typeof window === "undefined") return;
    const flush = () => {
      try {
        window.localStorage.setItem(storageKey, JSON.stringify(state));
      } catch {
        /* noop */
      }
    };
    window.addEventListener("beforeunload", flush);
    window.addEventListener("pagehide", flush);
    return () => {
      window.removeEventListener("beforeunload", flush);
      window.removeEventListener("pagehide", flush);
    };
  }, [state, storageKey]);

  const clear = () => {
    try {
      window.localStorage.removeItem(storageKey);
    } catch {
      /* noop */
    }
  };

  return [state, setState, clear];
}

/**
 * clearPersistedState — utility to remove a draft from outside a component
 * (e.g. after a successful save/submit).
 */
export function clearPersistedState(key: string, version = 1) {
  try {
    window.localStorage.removeItem(`lovable.persist.v${version}.${key}`);
  } catch {
    /* noop */
  }
}