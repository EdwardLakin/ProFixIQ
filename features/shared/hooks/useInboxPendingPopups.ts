"use client";

import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { createBrowserSupabase } from "@/features/shared/lib/supabase/client";
import { claimNotificationPopup } from "@/features/shared/lib/claimNotificationPopup";
import type { Database } from "@shared/types/types/supabase";

type InboxConversationSummary = {
  conversation: { id: string };
  unread_count?: number | null;
  latest_message?: { id: string; sender_id: string | null } | null;
};

type Options = {
  userId: string | null;
  enabled: boolean;
  loading: boolean;
  popupsEnabled: boolean;
  onOpenConversation: (conversationId: string) => void;
};

/** Popup-only inbox notifier for dedicated /mobile routes, which do not mount
 * AppShell. Mobile already renders its own unread badge (MobileBottomNav),
 * so this only surfaces the toast; it does not track unread counts. The
 * realtime channel subscribes before the first authorized fetch so a message
 * arriving in that window is never invisible to both. */
export function useInboxPendingPopups({
  userId, enabled, loading, popupsEnabled, onOpenConversation,
}: Options): void {
  const latest = useRef({ loading, popupsEnabled, onOpenConversation });
  latest.current = { loading, popupsEnabled, onOpenConversation };

  useEffect(() => {
    if (!enabled || !userId || loading || !popupsEnabled) return;
    const supabase = createBrowserSupabase();
    let active = true;
    let generation = 0;
    let initialized = false;
    const known = new Map<string, string>();
    const pendingRealtimeMessageIds = new Set<string>();

    const load = async () => {
      const requestId = ++generation;
      const response = await fetch("/api/chat/my-conversations", {
        credentials: "include",
      }).catch(() => null);
      if (!active || requestId !== generation || !response?.ok) return;
      const conversations = (await response.json().catch(() => [])) as
        InboxConversationSummary[];
      if (!active || requestId !== generation || !Array.isArray(conversations)) return;
      for (const row of conversations) {
        const message = row.latest_message;
        if (!message?.id) continue;
        const unseen = known.get(row.conversation.id) !== message.id;
        known.set(row.conversation.id, message.id);
        if (
          (initialized || pendingRealtimeMessageIds.has(message.id)) &&
          unseen && row.unread_count &&
          message.sender_id !== userId &&
          !latest.current.loading && latest.current.popupsEnabled &&
          claimNotificationPopup(userId, "message", message.id)
        ) {
          toast.info("New inbox message", {
            description: "A customer or teammate sent a message.",
            action: {
              label: "Open conversation",
              onClick: () => latest.current.onOpenConversation(row.conversation.id),
            },
          });
        }
      }
      if (requestId !== generation) return;
      pendingRealtimeMessageIds.clear();
      initialized = true;
    };

    const channel = supabase
      .channel("mobile-inbox-messages")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        (payload) => {
          if (!active) return;
          const raw = payload.new as unknown;
          const msg = raw as Database["public"]["Tables"]["messages"]["Row"] & {
            recipients?: string[] | null;
          };
          if (msg.sender_id === userId && msg.sender_kind === "staff") return;
          if (Array.isArray(msg.recipients) && !msg.recipients.includes(userId)) return;
          if (msg.id) pendingRealtimeMessageIds.add(msg.id);
          void load();
        },
      )
      .subscribe();

    void load();
    const interval = window.setInterval(() => { void load(); }, 60_000);
    const visibility = () => { if (document.visibilityState === "visible") void load(); };
    document.addEventListener("visibilitychange", visibility);

    return () => {
      active = false;
      generation += 1;
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", visibility);
      supabase.removeChannel(channel);
    };
  }, [enabled, userId, loading, popupsEnabled]);
}
