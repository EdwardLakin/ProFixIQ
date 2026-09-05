"use client";

import { useEffect, useRef } from "react";

import { createBrowserSupabase } from "@/features/shared/lib/supabase/client";

/**
 * Subscribes to new-message realtime events for exactly the technician's
 * current set of conversations, mirroring the same per-conversation
 * postgres_changes filter the chat inbox already uses in production
 * (features/chat/components/InboxModal.tsx) rather than inventing a new
 * subscription shape or broadcasting unfiltered. messages has no shop_id
 * column to filter on directly, so per-conversation-id filtering (already
 * proven safe there) is the right primitive, just opened for every
 * conversation the technician is in instead of only the one open in an
 * inbox UI.
 *
 * Re-subscribes only when the actual set of conversation ids changes, not
 * on every render that happens to produce a new array with the same ids.
 */
export function useTechnicianMessageWatch({
  conversationIds,
  onMessage,
}: {
  conversationIds: readonly string[];
  onMessage: () => void;
}): void {
  const onMessageRef = useRef(onMessage);
  useEffect(() => {
    onMessageRef.current = onMessage;
  }, [onMessage]);

  const idsKey = [...new Set(conversationIds)].sort().join(",");

  useEffect(() => {
    const ids = idsKey ? idsKey.split(",") : [];
    if (ids.length === 0) return;

    const supabase = createBrowserSupabase();
    const channels = ids.map((conversationId) =>
      supabase
        .channel(`technician-copilot-message:${conversationId}`)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "messages",
            filter: `conversation_id=eq.${conversationId}`,
          },
          () => onMessageRef.current(),
        )
        .subscribe(),
    );

    return () => {
      channels.forEach((channel) => void supabase.removeChannel(channel));
    };
  }, [idsKey]);
}
