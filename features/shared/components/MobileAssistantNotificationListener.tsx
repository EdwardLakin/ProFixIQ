"use client";

import { useEffect, useMemo, useState } from "react";
import { createBrowserSupabase } from "@/features/shared/lib/supabase/client";
import { useNotificationPreferences } from "@/features/shared/hooks/useNotificationPreferences";
import { useAssistantPendingPopups } from "@/features/shared/hooks/useAssistantPendingPopups";
import { resolveCanonicalStaffProfile } from "@/features/shared/lib/authenticated-profile";
import {
  canAccessShopAssistant,
  canonicalizeRole,
} from "@/features/shared/lib/rbac";

/** Dedicated /mobile routes do not mount AppShell. The authorized pending
 * endpoint is the final access boundary; 401/403 stops further polling.
 * Role is resolved the same way AppShell resolves it, so mobile popup
 * eligibility (canUseOperationsAssistant) matches the desktop shell exactly
 * -- in particular, mechanics use the separate Technician Copilot surface
 * and must not receive these assistant popups here either. */
export default function MobileAssistantNotificationListener() {
  const supabase = useMemo(() => createBrowserSupabase(), []);
  const [userId, setUserId] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);
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

  useEffect(() => {
    if (!userId) {
      setRole(null);
      return;
    }
    let active = true;
    resolveCanonicalStaffProfile(supabase, userId)
      .then(({ profile, error }) => {
        if (!active) return;
        setRole(error ? null : (profile?.role ?? null));
      })
      .catch(() => { if (active) setRole(null); });
    return () => {
      active = false;
    };
  }, [supabase, userId]);

  const canUseOperationsAssistant = Boolean(
    userId &&
      canAccessShopAssistant(role) &&
      canonicalizeRole(role) !== "mechanic",
  );

  useAssistantPendingPopups({
    userId,
    enabled: canUseOperationsAssistant,
    loading,
    popupsEnabled: preferences.assistantPopups,
  });
  return null;
}
