"use client";

import { useCallback, useState } from "react";

import { useVisibilityPolling } from "@/features/shared/hooks/useVisibilityPolling";

// These are actionable signals, not "unread" markers. Visiting a page does
// not clear them; only the underlying workflow or acknowledgement does.
export type NavigationQueueKey =
  | "fleetIntake"
  | "quoteReview"
  | "workOrders"
  | "parts"
  | "billing";

type QueueIndicators = Partial<Record<NavigationQueueKey, boolean>>;
type Notification = { code?: string; status?: string };
type FleetRequest = { workOrder?: { id: string } | null; status?: string };

const TERMINAL = new Set([
  "completed", "closed", "cancelled", "declined", "rejected",
]);

export function indicatorsFromNotifications(items: Notification[]): QueueIndicators {
  const codes = new Set(
    items.filter((item) => !item.status || item.status === "active").map((item) => item.code),
  );
  return {
    quoteReview: codes.has("quote_waiting"),
    workOrders: codes.has("work_order_on_hold_too_long") ||
      codes.has("work_order_waiting_too_long") ||
      codes.has("active_job_running_too_long"),
    parts: codes.has("parts_waiting_too_long"),
    billing: codes.has("invoice_unsent_too_long"),
  };
}

export function hasPendingFleetIntake(items: FleetRequest[]): boolean {
  return items.some((item) => !item.workOrder && !TERMINAL.has(item.status ?? ""));
}

/** A single visibility-aware refresh cycle; no per-pill polling. */
export function useNavigationQueueIndicators(
  enabled: boolean,
  includeFleetIntake: boolean,
): QueueIndicators {
  const [indicators, setIndicators] = useState<QueueIndicators>({});

  const refresh = useCallback(async () => {
    const [notificationResult, fleetResult] = await Promise.allSettled([
      fetch("/api/planner/notifications", { cache: "no-store" }),
      includeFleetIntake
        ? fetch("/api/fleet/service-requests", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({}),
            cache: "no-store",
          })
        : Promise.resolve(null),
    ]);

    if (notificationResult.status === "fulfilled" && notificationResult.value.ok) {
      const body = await notificationResult.value.json().catch(() => null) as
        | { notifications?: Notification[] }
        | null;
      const notifications = body?.notifications;
      if (Array.isArray(notifications)) {
        setIndicators((previous) => ({
          ...previous,
          ...indicatorsFromNotifications(notifications),
        }));
      }
    }

    if (fleetResult.status === "fulfilled" && fleetResult.value?.ok) {
      const body = await fleetResult.value.json().catch(() => null) as
        | { requests?: FleetRequest[] }
        | null;
      const requests = body?.requests;
      if (Array.isArray(requests)) {
        setIndicators((previous) => ({
          ...previous,
          fleetIntake: hasPendingFleetIntake(requests),
        }));
      }
    }
    // An unavailable or unauthorized feed never invents a positive badge.
  }, [includeFleetIntake]);

  useVisibilityPolling({
    enabled,
    intervalMs: 60_000,
    onTick: refresh,
  });
  return enabled ? indicators : {};
}
