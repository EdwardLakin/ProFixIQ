"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import {
  DASHBOARD_LAST_VIEW_KEY,
  type DashboardView,
} from "@/features/dashboard/lib/dashboard-views";

function isDashboardView(value: string | null): value is DashboardView {
  return value === "operations" || value === "performance";
}

export default function DashboardEntryPage() {
  const router = useRouter();

  useEffect(() => {
    const stored = window.localStorage.getItem(DASHBOARD_LAST_VIEW_KEY);
    const view: DashboardView = isDashboardView(stored) ? stored : "operations";

    router.replace(view === "performance" ? "/dashboard/performance" : "/dashboard/operations");
  }, [router]);

  return null;
}
