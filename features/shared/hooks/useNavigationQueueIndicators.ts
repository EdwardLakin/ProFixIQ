"use client";

import { useCallback, useEffect, useRef, useState } from "react";

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
    // The producer emits approval_waiting for overdue awaiting_approval work.
    quoteReview: codes.has("approval_waiting"),
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

/** One visibility-aware refresh cycle, with independently gated feeds. */
export function useNavigationQueueIndicators(
  enabled: boolean,
  includeFleetIntake: boolean,
  includeNotifications = true,
  scopeKey = "",
): QueueIndicators {
  const [snapshot, setSnapshot] = useState<{ scope: string; indicators: QueueIndicators }>({
    scope: "", indicators: {},
  });
  // Invalidate any in-flight result when a feed is disabled or the role changes.
  const version = useRef(0);
  const feedKey = enabled ? `${scopeKey}:${includeFleetIntake}:${includeNotifications}` : "";
  const currentFeedKey = useRef(feedKey);
  if (currentFeedKey.current !== feedKey) {
    currentFeedKey.current = feedKey;
    version.current += 1;
  }

  useEffect(() => {
    setSnapshot({ scope: feedKey, indicators: {} });
  }, [feedKey]);

  const refresh = useCallback(async () => {
    const generation = version.current;
    const [notificationResult, fleetResult] = await Promise.allSettled([
      includeNotifications
        ? fetch("/api/planner/notifications", { cache: "no-store" })
        : Promise.resolve(null),
      includeFleetIntake
        ? fetch("/api/fleet/service-requests", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({}),
            cache: "no-store",
          })
        : Promise.resolve(null),
    ]);
    if (generation !== version.current) return;

    if (notificationResult.status === "fulfilled" && notificationResult.value?.ok) {
      const body = await notificationResult.value.json().catch(() => null) as
        | { notifications?: Notification[] }
        | null;
      const notifications = body?.notifications;
      if (generation !== version.current) return;
      if (Array.isArray(notifications)) {
        setSnapshot((previous) => ({
          scope: feedKey,
          indicators: {
            ...(previous.scope === feedKey ? previous.indicators : {}),
            ...indicatorsFromNotifications(notifications),
          },
        }));
      }
    }

    if (fleetResult.status === "fulfilled" && fleetResult.value?.ok) {
      const body = await fleetResult.value.json().catch(() => null) as
        | { requests?: FleetRequest[] }
        | null;
      const requests = body?.requests;
      if (generation !== version.current) return;
      if (Array.isArray(requests)) {
        setSnapshot((previous) => ({
          scope: feedKey,
          indicators: {
            ...(previous.scope === feedKey ? previous.indicators : {}),
            fleetIntake: hasPendingFleetIntake(requests),
          },
        }));
      }
    }
    // An unavailable or unauthorized feed never invents a positive badge.
  }, [feedKey, includeFleetIntake, includeNotifications]);

  // The polling helper intentionally keeps its timer when the callback changes.
  // Give a new identity/feed an immediate first read instead of waiting 60s.
  useEffect(() => {
    if (!enabled || (!includeFleetIntake && !includeNotifications)) return;
    if (document.visibilityState === "visible") void refresh();
  }, [enabled, feedKey, includeFleetIntake, includeNotifications, refresh]);

  useVisibilityPolling({
    enabled: enabled && (includeFleetIntake || includeNotifications),
    intervalMs: 60_000,
    onTick: refresh,
    runOnMount: false,
  });
  return enabled && snapshot.scope === feedKey ? snapshot.indicators : {};
}
