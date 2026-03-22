"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

export type OpsNotification = {
  level: "info" | "warning" | "urgent";
  code:
    | "quote_waiting"
    | "approval_waiting"
    | "work_order_on_hold_too_long"
    | "work_order_waiting_too_long"
    | "tech_overloaded";
  title: string;
  message: string;
  href?: string;
  entityType?: string;
  entityId?: string;
  createdAt?: string;
};

type UseOpsNotificationsOptions = {
  enabled?: boolean;
  pollMs?: number;
};

type NotificationsResponse = {
  notifications?: OpsNotification[];
  error?: string;
};

export function useOpsNotifications(
  options: UseOpsNotificationsOptions = {},
) {
  const { enabled = true, pollMs = 30_000 } = options;

  const [items, setItems] = useState<OpsNotification[]>([]);
  const [loading, setLoading] = useState<boolean>(enabled);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    if (!enabled) return;

    try {
      setError(null);

      const res = await fetch("/api/planner/notifications", {
        method: "GET",
        cache: "no-store",
        headers: {
          "content-type": "application/json",
        },
      });

      const data = (await res.json().catch(() => ({}))) as NotificationsResponse;

      if (!res.ok) {
        throw new Error(data.error ?? "Failed to load notifications");
      }

      setItems(Array.isArray(data.notifications) ? data.notifications : []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load notifications");
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!enabled || pollMs <= 0) return;

    const id = window.setInterval(() => {
      void load();
    }, pollMs);

    return () => {
      window.clearInterval(id);
    };
  }, [enabled, pollMs, load]);

  const counts = useMemo(() => {
    let urgent = 0;
    let warning = 0;
    let info = 0;

    for (const item of items) {
      if (item.level === "urgent") urgent += 1;
      else if (item.level === "warning") warning += 1;
      else info += 1;
    }

    return {
      total: items.length,
      urgent,
      warning,
      info,
    };
  }, [items]);

  return {
    items,
    loading,
    error,
    counts,
    reload: load,
  };
}
