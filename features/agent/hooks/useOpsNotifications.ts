"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

export type OpsNotification = {
  id: string;
  level: "info" | "warning" | "critical";
  code:
    | "quote_waiting"
    | "approval_waiting"
    | "work_order_on_hold_too_long"
    | "work_order_waiting_too_long"
    | "parts_waiting_too_long"
    | "invoice_unsent_too_long"
    | "tech_overloaded"
    | "shop_overloaded"
    | "tech_underutilized_capacity"
    | "active_job_running_too_long"
    | "shop_throughput_below_capacity";
  title: string;
  message: string;
  href?: string;
  entityType?: string;
  entityId?: string;
  createdAt?: string;
  status?: "active" | "acknowledged" | "resolved";
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
  const [acknowledgingId, setAcknowledgingId] = useState<string | null>(null);

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

  const acknowledge = useCallback(
    async (id: string): Promise<void> => {
      try {
        setAcknowledgingId(id);
        setError(null);

        const res = await fetch(`/api/planner/notifications/${id}/ack`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
          },
        });

        const data = (await res.json().catch(() => ({}))) as { error?: string };

        if (!res.ok) {
          throw new Error(data.error ?? "Failed to acknowledge notification");
        }

        setItems((prev) => prev.filter((item) => item.id !== id));
      } catch (err: unknown) {
        setError(
          err instanceof Error
            ? err.message
            : "Failed to acknowledge notification",
        );
      } finally {
        setAcknowledgingId(null);
      }
    },
    [],
  );

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
    let critical = 0;
    let warning = 0;
    let info = 0;

    for (const item of items) {
      if (item.level === "critical") critical += 1;
      else if (item.level === "warning") warning += 1;
      else info += 1;
    }

    return {
      total: items.length,
      critical,
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
    acknowledge,
    acknowledgingId,
  };
}
