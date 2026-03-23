"use client";

import { useCallback, useEffect, useState } from "react";
import type { SuggestedActionsResponse } from "../types/suggested-actions";

type ErrorState = {
  error: string;
};

export function useSuggestedActions(enabled = true) {
  const [loading, setLoading] = useState(enabled);
  const [data, setData] = useState<SuggestedActionsResponse | ErrorState | null>(
    null,
  );

  const load = useCallback(async () => {
    if (!enabled) return;

    setLoading(true);
    try {
      const res = await fetch("/api/assistant/suggested-actions", {
        method: "GET",
        cache: "no-store",
      });

      const json = (await res.json()) as SuggestedActionsResponse | ErrorState;
      setData(json);
    } catch {
      setData({ error: "Failed to load suggested actions" });
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    void load();
  }, [load]);

  return {
    loading,
    data,
    reload: load,
  };
}
