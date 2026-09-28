"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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

  useEffect(() => {
    let active = true;
    setPreferences({ ...DEFAULT_NOTIFICATION_PREFERENCES });
    if (!userId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    void supabase.auth.getUser().then(({ data, error }) => {
      if (!active) return;
      if (!error && data.user?.id === userId) {
        setPreferences(parseNotificationPreferences(
          data.user.user_metadata?.[METADATA_KEY],
        ));
      }
      setLoading(false);
    }).catch(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [supabase, userId]);

  const update = useCallback(async (key: keyof NotificationPreferences, enabled: boolean) => {
    if (!userId || saving) return;
    const previous = preferences;
    const next = { ...preferences, [key]: enabled };
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
      setSaving(false);
    }
  }, [preferences, saving, supabase, userId]);

  return { preferences, loading, saving, update };
}
