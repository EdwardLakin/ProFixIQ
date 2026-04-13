"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

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
    const supabase = createClientComponentClient<Database>();

    (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      const uid = session?.user?.id;
      let role = "unknown";

      if (uid) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", uid)
          .maybeSingle();

        role = canonicalizeRole(profile?.role);
      }

      if (role === "admin") {
        router.replace("/dashboard/admin");
        return;
      }

      const stored = window.localStorage.getItem(DASHBOARD_LAST_VIEW_KEY);
      const view: DashboardView = isDashboardView(stored) ? stored : "operations";

      router.replace(view === "performance" ? "/dashboard/performance" : "/dashboard/operations");
    })();
  }, [router]);

  return null;
}
