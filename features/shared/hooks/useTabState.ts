"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTabsScopedStorageKey } from "@/features/shared/components/tabs/TabsBridge";

/**
 * Persist state in localStorage, scoped to the current route/tab.
 * - Synchronous lazy hydration (no empty first render)
 * - Re-hydrates when the scoped key changes (route switch)
 * - Persists on every change
 */
export function useTabState<T>(subkey: string, initial: T) {
  const scopedKey = useTabsScopedStorageKey(subkey);

  // Lazy init → hydrate synchronously for first render (prevents flicker)
  const initialValue = useMemo<T>(() => {
    if (typeof window === "undefined") return initial;
    try {
      const raw = window.localStorage.getItem(scopedKey);
      if (raw != null) return JSON.parse(raw) as T;
    } catch {
      /* ignore */
    }
    return initial;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopedKey]);

  const [state, setState] = useState<T>(initialValue);

  // If the scoped key itself changes (route/tab switch), re-hydrate
  const prevKeyRef = useRef(scopedKey);
  useEffect(() => {
    if (prevKeyRef.current === scopedKey) return;
    prevKeyRef.current = scopedKey;
    if (typeof window === "undefined") {
      setState(initial);
      return;
    }
    try {
      const raw = window.localStorage.getItem(scopedKey);
      setState(raw != null ? (JSON.parse(raw) as T) : initial);
    } catch {
      setState(initial);
    }
  }, [scopedKey, initial]);

  // Persist on change
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(scopedKey, JSON.stringify(state));
    } catch {
      /* ignore */
    }
  }, [scopedKey, state]);

  // Optional: react to other browser tabs writing to the same key
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== scopedKey) return;
      if (e.newValue == null) return;
      try {
        setState(JSON.parse(e.newValue) as T);
      } catch {
        /* ignore */
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [scopedKey]);

  return [state, setState] as const;
}