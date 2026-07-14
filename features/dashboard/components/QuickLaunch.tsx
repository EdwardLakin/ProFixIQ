"use client";

import { useTabs } from "@/features/shared/components/tabs/TabsProvider";

export default function QuickLaunch() {
  const { openTab } = useTabs();

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <button
        type="button"
        onClick={() => openTab("/maintenance50-air")}
        className="rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-4 text-left transition hover:border-[color:var(--accent-copper-soft,#fdba74)] hover:bg-[color:var(--theme-surface-inset)]"
      >
        <div className="text-sm font-semibold text-[color:var(--theme-text-primary)]">Maintenance 50 (Air)</div>
        <div className="mt-1 text-xs text-[color:var(--theme-text-secondary)]">
          Open CVIP-style air-brake inspection
        </div>
      </button>

      <button
        type="button"
        onClick={() => openTab("/work-orders/view")}
        className="rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-4 text-left transition hover:border-[color:var(--accent-copper-soft,#fdba74)] hover:bg-[color:var(--theme-surface-inset)]"
      >
        <div className="text-sm font-semibold text-[color:var(--theme-text-primary)]">View Work Orders</div>
        <div className="mt-1 text-xs text-[color:var(--theme-text-secondary)]">
          Browse and open WO tabs
        </div>
      </button>
    </div>
  );
}
