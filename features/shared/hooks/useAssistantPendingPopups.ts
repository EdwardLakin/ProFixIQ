"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { toast } from "sonner";
import { claimNotificationPopup, isNewAssistantAction } from "@/features/shared/lib/claimNotificationPopup";
import { resolveMobileHref } from "@/features/mobile/navigation/mobile-route-continuity";

type Options = {
  userId: string | null;
  enabled: boolean;
  loading: boolean;
  popupsEnabled: boolean;
};

/** Shared between desktop AppShell and the actual dedicated MobileShell. */
export function useAssistantPendingPopups({
  userId, enabled, loading, popupsEnabled,
}: Options): void {
  const router = useRouter();
  const pathname = usePathname();
  const latest = useRef({ userId, loading, popupsEnabled, pathname });
  latest.current = { userId, loading, popupsEnabled, pathname };

  useEffect(() => {
    if (!enabled || !userId || loading || !popupsEnabled) return;
    let active = true;
    let denied = false;
    let generation = 0;
    let baselineAt: number | null = null;
    // Monotonic elapsed time preserves the subscription boundary if the first
    // DB clock read fails, regardless of browser/server clock skew.
    const subscriptionStartedAt = performance.now();
    let baselineRequest: Promise<number | null> | null = null;
    const known = new Set<string>();

    const getBaseline = async (): Promise<number | null> => {
      if (baselineAt !== null) return baselineAt;
      if (!baselineRequest) {
        baselineRequest = (async () => {
          const response = await fetch("/api/shop-assistant/actions/pending?baseline=1", {
            cache: "no-store",
          }).catch(() => null);
          if (response?.status === 401 || response?.status === 403) denied = true;
          if (!response?.ok) return null;
          const body = await response.json().catch(() => null) as
            | { ok?: boolean; serverNow?: string } | null;
          const timestamp = Date.parse(body?.serverNow ?? "");
          return body?.ok === true && Number.isFinite(timestamp) ? timestamp : null;
        })();
      }
      const result = await baselineRequest;
      if (result === null) baselineRequest = null;
      else baselineAt = result - (performance.now() - subscriptionStartedAt);
      return baselineAt;
    };

    const load = async () => {
      if (denied || document.visibilityState !== "visible") return;
      const requestId = ++generation;
      const baseline = await getBaseline();
      if (!active || denied || requestId !== generation || baseline === null) return;
      const response = await fetch("/api/shop-assistant/actions/pending", {
        cache: "no-store",
      }).catch(() => null);
      if (response?.status === 401 || response?.status === 403) denied = true;
      if (!active || requestId !== generation || !response?.ok) return;
      const payload = await response.json().catch(() => null) as
        | { ok?: boolean; actions?: Array<{
            id: string; threadId: string; createdAt: string;
            preview?: { title?: string };
          }> } | null;
      if (!active || requestId !== generation ||
          payload?.ok !== true || !Array.isArray(payload.actions)) return;
      for (const action of payload.actions) {
        if (!action.id) continue;
        const unseen = !known.has(action.id);
        known.add(action.id);
        if (unseen && isNewAssistantAction(action.createdAt, baseline) &&
            latest.current.userId === userId &&
            !latest.current.loading && latest.current.popupsEnabled &&
            claimNotificationPopup(userId, "assistant", action.id)) {
          toast.info("ProFix Operations needs your confirmation", {
            description: action.preview?.title ?? "An action is waiting for review.",
            action: {
              label: "Review",
              onClick: () => {
                const href = action.threadId
                  ? `/assistant?threadId=${encodeURIComponent(action.threadId)}`
                  : "/assistant";
                router.push(latest.current.pathname.startsWith("/mobile")
                  ? (resolveMobileHref(href) ?? "/mobile/assistant")
                  : href);
              },
            },
          });
        }
      }
    };
    void load();
    const timer = window.setInterval(() => { void load(); }, 45_000);
    const visibility = () => { if (document.visibilityState === "visible") void load(); };
    document.addEventListener("visibilitychange", visibility);
    return () => {
      active = false;
      generation += 1;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [enabled, userId, loading, popupsEnabled, router]);
}
