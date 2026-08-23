"use client";

import { useEffect, useRef, useState } from "react";

import { createBrowserSupabase } from "@/features/shared/lib/supabase/client";
import {
  createOperationsEventDeduper,
  OPERATIONS_INVALIDATION_EVENT,
  OPERATIONS_REALTIME_TABLES,
  operationsRealtimeMutationKey,
  type OperationsLiveStatus,
} from "@/features/work-orders/lib/operations-invalidation";

type RefreshReason = "local" | "realtime" | "reconnect";

export function useOperationsLiveRefresh({
  shopId,
  onRefresh,
}: {
  shopId: string | null;
  onRefresh: (reason: RefreshReason) => void | Promise<void>;
}): OperationsLiveStatus {
  const refreshRef = useRef(onRefresh);
  const [liveStatus, setLiveStatus] =
    useState<OperationsLiveStatus>("connecting");

  useEffect(() => {
    refreshRef.current = onRefresh;
  }, [onRefresh]);

  useEffect(() => {
    if (!shopId) {
      setLiveStatus("unavailable");
      return;
    }

    const supabase = createBrowserSupabase();
    const deduper = createOperationsEventDeduper();
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;
    let disposed = false;

    const scheduleRefresh = (key: string, reason: RefreshReason) => {
      if (!deduper.accept(key)) return;
      if (refreshTimer) clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => {
        refreshTimer = null;
        if (!disposed) void refreshRef.current(reason);
      }, 100);
    };

    const channel = supabase.channel(`operations-freshness:${shopId}`);
    OPERATIONS_REALTIME_TABLES.forEach((table) => {
      channel.on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table,
          filter: `shop_id=eq.${shopId}`,
        },
        (payload) => {
          scheduleRefresh(
            operationsRealtimeMutationKey(table, payload),
            "realtime",
          );
        },
      );
    });

    channel.subscribe((status) => {
      if (disposed) return;
      if (status === "SUBSCRIBED") setLiveStatus("live");
      if (
        status === "CHANNEL_ERROR" ||
        status === "TIMED_OUT" ||
        status === "CLOSED"
      ) {
        setLiveStatus("unavailable");
      }
    });

    const handleLocalInvalidation = (event: Event) => {
      const detail = (event as CustomEvent<Record<string, unknown>>).detail;
      const key =
        cleanMutationId(detail?.mutationId) ||
        `${event.type}:${cleanMutationId(detail?.recordId) || Date.now()}`;
      scheduleRefresh(`local:${key}`, "local");
    };
    const handleReconnect = () => {
      setLiveStatus("connecting");
      scheduleRefresh(`reconnect:${Date.now()}`, "reconnect");
    };
    const handleOffline = () => setLiveStatus("unavailable");

    window.addEventListener(
      OPERATIONS_INVALIDATION_EVENT,
      handleLocalInvalidation,
    );
    window.addEventListener("wo:line-added", handleLocalInvalidation);
    window.addEventListener("parts:received", handleLocalInvalidation);
    window.addEventListener("online", handleReconnect);
    window.addEventListener("offline", handleOffline);

    if (!navigator.onLine) setLiveStatus("unavailable");

    return () => {
      disposed = true;
      if (refreshTimer) clearTimeout(refreshTimer);
      window.removeEventListener(
        OPERATIONS_INVALIDATION_EVENT,
        handleLocalInvalidation,
      );
      window.removeEventListener("wo:line-added", handleLocalInvalidation);
      window.removeEventListener("parts:received", handleLocalInvalidation);
      window.removeEventListener("online", handleReconnect);
      window.removeEventListener("offline", handleOffline);
      void supabase.removeChannel(channel);
    };
  }, [shopId]);

  return liveStatus;
}

function cleanMutationId(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}
