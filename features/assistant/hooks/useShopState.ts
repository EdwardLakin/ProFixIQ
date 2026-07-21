"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AssistantContext } from "../types/assistant";
import type { ShopAssistantState } from "../types/shopState";

type ShopStateResponse =
  | { ok: true; state: ShopAssistantState }
  | { ok: false; error: string };

function queryString(context?: AssistantContext, force = false): string {
  const params = new URLSearchParams();
  if (context?.workOrderId) params.set("workOrderId", context.workOrderId);
  if (context?.customerId) params.set("customerId", context.customerId);
  if (context?.vehicleId) params.set("vehicleId", context.vehicleId);
  if (context?.bookingId) params.set("bookingId", context.bookingId);
  if (context?.pageType) params.set("pageType", context.pageType);
  if (context?.pageTitle) params.set("pageTitle", context.pageTitle);
  if (force) params.set("refresh", "1");
  return params.toString();
}

export function useShopState(context?: AssistantContext) {
  const contextKey = useMemo(() => queryString(context), [context]);
  const [state, setState] = useState<ShopAssistantState | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestVersion = useRef(0);

  const load = useCallback(
    async (force = false, signal?: AbortSignal) => {
      const version = ++requestVersion.current;
      if (force) setRefreshing(true);
      else setLoading(true);
      setError(null);

      try {
        const suffix = queryString(context, force);
        const response = await fetch(
          `/api/assistant/shop-state${suffix ? `?${suffix}` : ""}`,
          { cache: "no-store", signal },
        );
        const json = (await response.json()) as ShopStateResponse;
        if (!response.ok || !json.ok) {
          throw new Error(json.ok ? "Shop summary request failed" : json.error);
        }
        if (version === requestVersion.current) setState(json.state);
      } catch (caught: unknown) {
        if (caught instanceof DOMException && caught.name === "AbortError") return;
        if (version === requestVersion.current) {
          setError(
            caught instanceof Error
              ? caught.message
              : "Failed to load the live shop summary",
          );
        }
      } finally {
        if (version === requestVersion.current) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [context],
  );

  useEffect(() => {
    const controller = new AbortController();
    void load(false, controller.signal);
    const interval = window.setInterval(() => void load(false), 60_000);

    return () => {
      controller.abort();
      window.clearInterval(interval);
    };
  }, [contextKey, load]);

  return {
    state,
    loading,
    refreshing,
    error,
    refresh: () => load(true),
  };
}
