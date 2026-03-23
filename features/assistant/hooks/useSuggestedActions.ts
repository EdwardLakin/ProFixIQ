//features/assistant/hooks/useSuggestedActions.ts

"use client";

import { useCallback, useEffect, useState } from "react";
import type {
  SuggestedActionContext,
  SuggestedActionsResponse,
} from "../types/suggested-actions";

type ErrorState = {
  error: string;
};

export function useSuggestedActions(
  enabled = true,
  context?: SuggestedActionContext,
) {
  const [loading, setLoading] = useState(enabled);
  const [data, setData] = useState<SuggestedActionsResponse | ErrorState | null>(
    null,
  );

  const load = useCallback(async () => {
    if (!enabled) return;

    setLoading(true);
    try {
      const usePost =
        Boolean(context?.workOrderId) ||
        Boolean(context?.customerId) ||
        Boolean(context?.vehicleId) ||
        Boolean(context?.bookingId) ||
        Boolean(context?.pageType);

      const res = await fetch("/api/assistant/suggested-actions", {
        method: usePost ? "POST" : "GET",
        cache: "no-store",
        headers: {
          "content-type": "application/json",
        },
        body: usePost ? JSON.stringify({ context }) : undefined,
      });

      const json = (await res.json()) as SuggestedActionsResponse | ErrorState;
      setData(json);
    } catch {
      setData({ error: "Failed to load suggested actions" });
    } finally {
      setLoading(false);
    }
  }, [enabled, context]);

  useEffect(() => {
    void load();
  }, [load]);

  return {
    loading,
    data,
    reload: load,
  };
}
