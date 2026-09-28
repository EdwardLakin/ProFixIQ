"use client";

import { useEffect, useMemo, useState } from "react";
import { createBrowserSupabase } from "@/features/shared/lib/supabase/client";
import { useNotificationPreferences } from "@/features/shared/hooks/useNotificationPreferences";
import { useAssistantPendingPopups } from "@/features/shared/hooks/useAssistantPendingPopups";

/** Dedicated /mobile routes do not mount AppShell. The authorized pending
 * endpoint is the final access boundary; 401/403 stops further polling. */
export default function MobileAssistantNotificationListener() {
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

  useAssistantPendingPopups({
    userId,
    enabled: Boolean(userId),
    loading,
    popupsEnabled: preferences.assistantPopups,
  });
  return null;
}
