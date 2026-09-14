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
const REFRESH_INTERVAL_MS = 45_000;

function threadHref(
  thread: Pick<ShopAssistantThread, "id" | "title" | "context">,
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
  // The activity list always resolves to the newest thread on its own, so a
  // link must carry the exact thread id to land back on this thread instead
  // of whatever else has since become the most recently active one.
  const [path, query = ""] = built.split("?");
  const params = new URLSearchParams(query);
  params.set("threadId", thread.id);
  const withThread = `${path}?${params.toString()}`;
  return mobile
    ? (resolveMobileHref(withThread) ?? "/mobile/assistant")
    : withThread;
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
    setLoading(true);
    void load();

    // A pending confirmation can expire (15-minute default), or be
    // confirmed/cancelled from another tab or device, so this list needs to
    // stay current on its own rather than only reacting to activity in this
    // tab's conversation.
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, REFRESH_INTERVAL_MS);

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") void load();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [load, refreshToken]);

  return { loading, error, pendingActions, recentThreads, reload: load };
}
