"use client";

import { useEffect, useMemo, useState } from "react";

import { createBrowserSupabase } from "@/features/shared/lib/supabase/client";

type CapabilityRow = {
  capability: string;
  enabled: boolean;
};

export function resolveTechnicianCopilotTextAvailability(
  rows: readonly CapabilityRow[],
  technicianId: string,
): boolean {
  const technician = rows.find(
    (row) =>
      row.capability === `technician_copilot_text:${technicianId}`,
  );
  if (technician) return technician.enabled;

  return (
    rows.find((row) => row.capability === "technician_copilot_text")
      ?.enabled ?? false
  );
}

export function useTechnicianCopilotAvailability(
  shouldCheck: boolean,
): boolean {
  const supabase = useMemo(() => createBrowserSupabase(), []);
  const [available, setAvailable] = useState(false);

  useEffect(() => {
    let active = true;
    setAvailable(false);
    if (!shouldCheck) return () => {
      active = false;
    };

    void (async () => {
      const auth = await supabase.auth.getUser();
      const user = auth.data.user;
      if (auth.error || !user) return;

      let profileResult = await supabase
        .from("profiles")
        .select("id,shop_id,role")
        .eq("user_id", user.id)
        .maybeSingle();
      if (!profileResult.data && !profileResult.error) {
        profileResult = await supabase
          .from("profiles")
          .select("id,shop_id,role")
          .eq("id", user.id)
          .maybeSingle();
      }

      const profile = profileResult.data;
      const role = String(profile?.role ?? "").toLowerCase();
      if (
        profileResult.error ||
        !profile?.id ||
        !profile.shop_id ||
        (role !== "mechanic" && role !== "technician" && role !== "tech")
      ) {
        return;
      }

      const names = [
        "technician_copilot_text",
        `technician_copilot_text:${profile.id}`,
      ];
      const settings = await supabase
        .from("ai_automation_capability_settings")
        .select("capability,enabled")
        .eq("shop_id", profile.shop_id)
        .in("capability", names);

      if (!active || settings.error) return;
      setAvailable(
        resolveTechnicianCopilotTextAvailability(
          (settings.data ?? []) as CapabilityRow[],
          profile.id,
        ),
      );
    })();

    return () => {
      active = false;
    };
  }, [shouldCheck, supabase]);

  return available;
}
