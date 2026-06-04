"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabase } from "@/features/shared/lib/supabase/client";

import {
  DASHBOARD_LAST_VIEW_KEY,
  type DashboardView,
} from "@/features/dashboard/lib/dashboard-views";
import { canonicalizeRole } from "@/features/shared/lib/rbac";

function isDashboardView(value: string | null): value is DashboardView {
  return value === "operations" || value === "performance";
}

export default function DashboardEntryPage() {
  const router = useRouter();

  useEffect(() => {
    const supabase = createBrowserSupabase();

    (async () => {
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      const uid = user?.id;
      let role = "unknown";

      if (uid) {
        const { data: profile, error: profileError } = await supabase
          .from("profiles")
          .select("id,email,role,shop_id")
          .eq("id", uid)
          .maybeSingle();

        console.info("[DashboardEntry] profile resolved", {
          authUserId: uid,
          authEmail: user?.email ?? null,
          profileId: profile?.id ?? null,
          profileEmail: profile?.email ?? null,
          role: profile?.role ?? null,
          shopIdPresent: Boolean(profile?.shop_id),
          authError: authError?.message ?? null,
          profileError: profileError
            ? { message: profileError.message, code: profileError.code }
            : null,
        });

        role = canonicalizeRole(profile?.role);
      }

      if (role === "admin") {
        router.replace("/dashboard/admin");
        return;
      }

      if (role === "lead_hand" || role === "foreman") {
        router.replace("/dashboard/operations");
        return;
      }

      const stored = window.localStorage.getItem(DASHBOARD_LAST_VIEW_KEY);
      const view: DashboardView = isDashboardView(stored) ? stored : "operations";

      router.replace(view === "performance" ? "/dashboard/performance" : "/dashboard/operations");
    })();
  }, [router]);

  return null;
}
