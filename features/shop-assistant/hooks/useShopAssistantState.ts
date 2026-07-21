"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type {
  ShopAssistantState,
  ShopAssistantStateResponse,
} from "@/features/shop-assistant/server/state/types";

const REFRESH_INTERVAL_MS = 45_000;

export function useShopAssistantState(refreshToken?: string | number) {
  const [state, setState] = useState<ShopAssistantState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestRef = useRef<AbortController | null>(null);

  const loadState = useCallback(async (force: boolean) => {
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;

    try {
      setError(null);
      const response = await fetch(
        `/api/shop-assistant/state${force ? "?refresh=1" : ""}`,
        {
          cache: "no-store",
          signal: controller.signal,
        },
      );
      const payload = (await response.json().catch(() => ({}))) as
        | ShopAssistantStateResponse
        | { ok?: false; error?: string };

      if (!response.ok || payload.ok !== true) {
        throw new Error(
          payload.ok === false && payload.error
            ? payload.error
            : "Failed to load live shop state",
        );
      }

      setState(payload.state);
    } catch (refreshError: unknown) {
      if (controller.signal.aborted) return;
      setError(
        refreshError instanceof Error
          ? refreshError.message
          : "Failed to load live shop state",
      );
    } finally {
      if (requestRef.current === controller) requestRef.current = null;
      setLoading(false);
    }
  }, []);

  const refresh = useCallback(async () => loadState(true), [loadState]);

  useEffect(() => {
    setLoading(true);
    void loadState(false);

    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") void loadState(false);
    }, REFRESH_INTERVAL_MS);

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") void loadState(false);
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      requestRef.current?.abort();
    };
  }, [loadState, refreshToken]);

  return { state, loading, error, refresh };
}
