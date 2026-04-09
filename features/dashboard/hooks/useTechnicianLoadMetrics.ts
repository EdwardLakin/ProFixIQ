"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  getTechnicianLoadMetrics,
  type TechnicianLoadMetricResult,
} from "@shared/lib/stats/getTechnicianLoadMetrics";
import { useVisibilityPolling } from "@/features/shared/hooks/useVisibilityPolling";

type UseTechnicianLoadMetricsOptions = {
  enabled?: boolean;
  pollMs?: number;
};

export function useTechnicianLoadMetrics(
  shopId: string | null,
  options: UseTechnicianLoadMetricsOptions = {},
) {
  const { enabled = true, pollMs = 30_000 } = options;

  const [metrics, setMetrics] = useState<TechnicianLoadMetricResult | null>(null);
  const [loading, setLoading] = useState<boolean>(Boolean(enabled && shopId));
  const [error, setError] = useState<string | null>(null);

  const hasLoadedRef = useRef(false);

  useEffect(() => {
    hasLoadedRef.current = false;
    setMetrics(null);
    setError(null);
    setLoading(Boolean(enabled && shopId));
  }, [enabled, shopId]);

  const load = useCallback(async () => {
    if (!enabled || !shopId) {
      setLoading(false);
      return;
    }

    if (!hasLoadedRef.current) {
      setLoading(true);
    }

    try {
      setError(null);

      const result = await getTechnicianLoadMetrics(shopId);
      hasLoadedRef.current = true;
      setMetrics(result);
    } catch (e) {
      hasLoadedRef.current = true;
      setError(e instanceof Error ? e.message : "Failed to load technician load metrics.");
      setMetrics(null);
    } finally {
      setLoading(false);
    }
  }, [enabled, shopId]);

  useVisibilityPolling({
    enabled: enabled && Boolean(shopId),
    intervalMs: pollMs,
    onTick: load,
    runOnMount: true,
  });

  return {
    metrics,
    loading,
    error,
    reload: load,
  };
}
