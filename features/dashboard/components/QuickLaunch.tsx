"use client";
import { useTabs } from "@/features/shared/components/tabs/TabsProvider";

export default function QuickLaunch() {
  const { openTab } = useTabs();

  return (
    <div className="grid gap-2 sm:grid-cols-2">
      <button
        onClick={() => openTab("/maintenance50-air")}
        className="rounded border border-neutral-800 bg-neutral-950 hover:bg-neutral-900 p-3 text-left"
      >
        <div className="font-medium">Maintenance 50 (Air)</div>
        <div className="text-xs text-neutral-400">Open CVIP-style air-brake inspection</div>
      </button>

      <button
        onClick={() => openTab("/work-orders/view")}
        className="rounded border border-neutral-800 bg-neutral-950 hover:bg-neutral-900 p-3 text-left"
      >
        <div className="font-medium">View Work Orders</div>
        <div className="text-xs text-neutral-400">Browse and open WO tabs</div>
      </button>
    </div>
  );
}