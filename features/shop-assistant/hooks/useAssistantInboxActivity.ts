"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname } from "next/navigation";

import { resolveMobileHref } from "@/features/mobile/navigation/mobile-route-continuity";
import { buildAssistantHref } from "@/features/assistant/lib/buildAssistantHref";
import type {
  ShopAssistantPendingActionsResponse,
  ShopAssistantThread,
  ShopAssistantThreadListResponse,
} from "@/features/shop-assistant/types";

export type AssistantInboxPendingItem = {
  id: string;
  title: string;
  summary: string;
  consequences: string[];
  expiresAt: string;
  href: string;
};

export type AssistantInboxThreadItem = {
  id: string;
  title: string;
  lastMessageAt: string;
  href: string;
};

const RECENT_THREADS_LIMIT = 8;

function threadHref(
  thread: Pick<ShopAssistantThread, "title" | "context">,
  mobile: boolean,
): string {
  const built = buildAssistantHref({
    workOrderId: thread.context.activeWorkOrderId,
    vehicleId: thread.context.activeVehicleId,
    customerId: thread.context.activeCustomerId,
    bookingId: thread.context.activeBookingId,
    invoiceId: thread.context.activeInvoiceId,
    pageTitle: thread.title || undefined,
  });
  return mobile ? (resolveMobileHref(built) ?? "/mobile/assistant") : built;
}

export function useAssistantInboxActivity(refreshToken?: string | number) {
  const pathname = usePathname();
  const mobile = pathname.startsWith("/mobile");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pendingActions, setPendingActions] = useState<
    AssistantInboxPendingItem[]
  >([]);
  const [recentThreads, setRecentThreads] = useState<
    AssistantInboxThreadItem[]
  >([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const [pendingRes, threadsRes] = await Promise.all([
        fetch("/api/shop-assistant/actions/pending", { cache: "no-store" }),
        fetch("/api/shop-assistant/threads", { cache: "no-store" }),
      ]);

      const pendingJson = (await pendingRes
        .json()
        .catch(() => null)) as ShopAssistantPendingActionsResponse | null;
      const threadsJson = (await threadsRes
        .json()
        .catch(() => null)) as ShopAssistantThreadListResponse | null;

      if (!pendingJson || pendingJson.ok !== true) {
        throw new Error(
          pendingJson?.ok === false
            ? pendingJson.error
            : "Failed to load pending confirmations",
        );
      }
      if (!threadsJson || threadsJson.ok !== true) {
        throw new Error(
          threadsJson?.ok === false
            ? threadsJson.error
            : "Failed to load recent activity",
        );
      }

      const threadById = new Map(
        threadsJson.threads.map((thread) => [thread.id, thread]),
      );

      setPendingActions(
        pendingJson.actions.map((action) => {
          const thread = threadById.get(action.threadId);
          return {
            id: action.id,
            title: action.preview.title,
            summary: action.preview.summary,
            consequences: action.preview.consequences,
            expiresAt: action.preview.expiresAt,
            href: thread
              ? threadHref(thread, mobile)
              : mobile
                ? "/mobile/assistant"
                : "/assistant",
          };
        }),
      );

      setRecentThreads(
        threadsJson.threads.slice(0, RECENT_THREADS_LIMIT).map((thread) => ({
          id: thread.id,
          title: thread.title || "General conversation",
          lastMessageAt: thread.lastMessageAt,
          href: threadHref(thread, mobile),
        })),
      );
    } catch (loadError: unknown) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Failed to load assistant activity",
      );
    } finally {
      setLoading(false);
    }
  }, [mobile]);

  useEffect(() => {
    void load();
  }, [load, refreshToken]);

  return { loading, error, pendingActions, recentThreads, reload: load };
}
