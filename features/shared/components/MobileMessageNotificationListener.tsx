"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabase } from "@/features/shared/lib/supabase/client";
import { useNotificationPreferences } from "@/features/shared/hooks/useNotificationPreferences";
import { useInboxPendingPopups } from "@/features/shared/hooks/useInboxPendingPopups";

/** Dedicated /mobile routes do not mount AppShell, so message popups need
 * their own listener here, mirroring MobileAssistantNotificationListener.
 * Mobile already shows its own unread badge (MobileBottomNav); this only
 * adds the popup toast, routed to the mobile conversation thread. */
export default function MobileMessageNotificationListener() {
  const router = useRouter();
  const supabase = useMemo(() => createBrowserSupabase(), []);
  const [userId, setUserId] = useState<string | null>(null);
  const { preferences, loading } = useNotificationPreferences(userId);

  useEffect(() => {
    let active = true;
    void supabase.auth.getUser().then(({ data, error }) => {
      if (active) setUserId(error ? null : data.user?.id ?? null);
    }).catch(() => { if (active) setUserId(null); });
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        if (active) setUserId(session?.user.id ?? null);
      },
    );
    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [supabase]);

  useInboxPendingPopups({
    userId,
    enabled: Boolean(userId),
    loading,
    popupsEnabled: preferences.messagePopups,
    onOpenConversation: (conversationId) => {
      router.push(`/mobile/messages/${encodeURIComponent(conversationId)}`);
    },
  });
  return null;
}
