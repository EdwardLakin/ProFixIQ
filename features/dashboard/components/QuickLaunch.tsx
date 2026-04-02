"use client";

import { useTabs } from "@/features/shared/components/tabs/TabsProvider";

export default function QuickLaunch() {
  const { openTab } = useTabs();

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <button
        type="button"
        onClick={() => openTab("/maintenance50-air")}
        className="rounded-xl border border-white/10 bg-black/20 p-4 text-left transition hover:border-[color:var(--accent-copper-soft,#fdba74)] hover:bg-black/30"
      >
        <div className="text-sm font-semibold text-white">Maintenance 50 (Air)</div>
        <div className="mt-1 text-xs text-neutral-400">
          Open CVIP-style air-brake inspection
        </div>
      </button>

      <button
        type="button"
        onClick={() => openTab("/work-orders/view")}
        className="rounded-xl border border-white/10 bg-black/20 p-4 text-left transition hover:border-[color:var(--accent-copper-soft,#fdba74)] hover:bg-black/30"
      >
        <div className="text-sm font-semibold text-white">View Work Orders</div>
        <div className="mt-1 text-xs text-neutral-400">
          Browse and open WO tabs
        </div>
      </button>
    </div>
  );
}
