"use client";

import Link from "next/link";

import {
  DASHBOARD_LAST_VIEW_KEY,
  DASHBOARD_VIEW_LABEL,
  type DashboardView,
} from "@/features/dashboard/lib/dashboard-views";

type Props = {
  currentView: DashboardView;
};

const DASHBOARD_VIEW_ROUTE: Record<DashboardView, string> = {
  operations: "/dashboard/operations",
  performance: "/dashboard/performance",
};

export default function DashboardViewSwitcher({ currentView }: Props) {
  return (
    <nav
      className="inline-flex rounded-full border border-white/10 bg-black/20 p-1"
      aria-label="Dashboard view"
    >
      {(Object.keys(DASHBOARD_VIEW_LABEL) as DashboardView[]).map((view) => {
        const active = view === currentView;

        return (
          <Link
            key={view}
            href={DASHBOARD_VIEW_ROUTE[view]}
            onClick={() => {
              window.localStorage.setItem(DASHBOARD_LAST_VIEW_KEY, view);
            }}
            aria-current={active ? "page" : undefined}
            className="rounded-full px-3 py-1.5 text-xs font-semibold transition"
            style={{
              color: active
                ? "var(--theme-text-primary,#F8FAFC)"
                : "var(--theme-text-secondary,#94A3B8)",
              background: active
                ? "color-mix(in srgb, var(--brand-accent,#E39A6E) 24%, transparent)"
                : "transparent",
            }}
          >
            {view === "operations" ? "Operations" : "Performance"}
          </Link>
        );
      })}
    </nav>
  );
}
