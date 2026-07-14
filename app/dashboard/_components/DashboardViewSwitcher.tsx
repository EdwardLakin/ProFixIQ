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
    <nav className="inline-flex items-center gap-1.5 rounded-lg border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-1.5 py-1" aria-label="Dashboard view">
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
            className="rounded-md px-3 py-1.5 text-xs font-semibold transition"
            style={{
              color: active
                ? "var(--theme-text-primary,var(--theme-text-primary))"
                : "var(--theme-text-secondary,var(--theme-text-muted))",
              background: active
                ? "color-mix(in srgb, var(--brand-accent,#E39A6E) 16%, var(--theme-surface-inset))"
                : "transparent",
              boxShadow: active ? "inset 0 -1px 0 color-mix(in srgb, var(--brand-accent,#E39A6E) 70%, transparent)" : "none",
            }}
          >
            {view === "operations" ? "Operations" : "Performance"}
          </Link>
        );
      })}
    </nav>
  );
}
