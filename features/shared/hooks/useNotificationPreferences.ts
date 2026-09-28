"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { createBrowserSupabase } from "@/features/shared/lib/supabase/client";

export type NotificationPreferences = {
  navigationIndicators: boolean;
  messagePopups: boolean;
  assistantPopups: boolean;
};

export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  navigationIndicators: true,
  messagePopups: true,
  assistantPopups: true,
};

const METADATA_KEY = "profixiq_notification_preferences";
const FAIL_CLOSED_PREFERENCES: NotificationPreferences = {
  ...DEFAULT_NOTIFICATION_PREFERENCES,
  messagePopups: false,
  assistantPopups: false,
};

export function parseNotificationPreferences(value: unknown): NotificationPreferences {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ...DEFAULT_NOTIFICATION_PREFERENCES };
  }
  const stored = value as Record<string, unknown>;
  return {
    navigationIndicators: typeof stored.navigationIndicators === "boolean"
      ? stored.navigationIndicators : true,
    messagePopups: typeof stored.messagePopups === "boolean"
      ? stored.messagePopups : true,
    assistantPopups: typeof stored.assistantPopups === "boolean"
      ? stored.assistantPopups : true,
  };
}

export function useNotificationPreferences(userId: string | null) {
  const supabase = useMemo(() => createBrowserSupabase(), []);
  const [preferences, setPreferences] = useState<NotificationPreferences>(
    DEFAULT_NOTIFICATION_PREFERENCES,
  );
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const readVersion = useRef(0);
  const savingRef = useRef(false);

  useEffect(() => {
    let active = true;
    const refresh = async () => {
      if (!userId || savingRef.current) return;
      const version = ++readVersion.current;
      try {
        const { data, error } = await supabase.auth.getUser();
        if (!active || version !== readVersion.current) return;
        if (error || data.user?.id !== userId) throw error ?? new Error("User changed");
        setPreferences(parseNotificationPreferences(data.user.user_metadata?.[METADATA_KEY]));
        setLoadError(false);
      } catch {
        if (!active || version !== readVersion.current) return;
        // Never silently re-enable popups after an unavailable metadata read.
        setPreferences(FAIL_CLOSED_PREFERENCES);
        setLoadError(true);
      } finally {
        if (active && version === readVersion.current) setLoading(false);
      }
    };

    setPreferences(FAIL_CLOSED_PREFERENCES);
    setLoadError(false);
    setLoading(Boolean(userId));
    if (userId) void refresh();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (!active || !userId || event !== "USER_UPDATED") return;
        if (session?.user.id !== userId || savingRef.current) return;
        ++readVersion.current;
        setPreferences(parseNotificationPreferences(
          session.user.user_metadata?.[METADATA_KEY],
        ));
        setLoadError(false);
        setLoading(false);
      },
    );
    const onFocus = () => { if (document.visibilityState === "visible") void refresh(); };
    const onVisibility = () => { if (document.visibilityState === "visible") void refresh(); };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      active = false;
      ++readVersion.current;
      subscription.unsubscribe();
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [supabase, userId]);

  const update = useCallback(async (key: keyof NotificationPreferences, enabled: boolean) => {
    if (!userId || savingRef.current || loadError || loading) return;
    const previous = preferences;
    const next = { ...preferences, [key]: enabled };
    savingRef.current = true;
    ++readVersion.current;
    setPreferences(next);
    setSaving(true);
    try {
      const { data, error } = await supabase.auth.updateUser({
        data: { [METADATA_KEY]: next },
      });
      if (error || data.user?.id !== userId) {
        throw error ?? new Error("Unable to save notification preferences");
      }
    } catch {
      setPreferences(previous);
      toast.error("Could not save notification preferences");
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }, [loadError, loading, preferences, supabase, userId]);

  return { preferences, loading, saving, loadError, update };
}
