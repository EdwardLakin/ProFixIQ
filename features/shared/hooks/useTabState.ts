"use client";

import { useEffect, useState } from "react";
import { useTabsScopedStorageKey } from "@/features/shared/hooks/useTabScopedStorageKey";

/**
 * Persist React state per route/tab using localStorage.
 * Automatically loads on mount and saves on change.
 */
export function useTabState<T>(subkey: string, initial: T) {
  const key = useTabsScopedStorageKey(subkey);
  const [state, setState] = useState<T>(initial);

  // Load saved state
  useEffect(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw != null) {
        setState(JSON.parse(raw) as T);
      }
    } catch {
      // ignore bad JSON
    }
  }, [key]);

  // Save whenever state changes
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(state));
    } catch {
      // ignore quota/storage errors
    }
  }, [key, state]);

  return [state, setState] as const;
}