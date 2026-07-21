"use client";

import type { ShopAssistantMetrics } from "@/features/shop-assistant/server/state/types";

type Props = {
  metrics: ShopAssistantMetrics;
};

const METRICS: Array<{
  key: keyof ShopAssistantMetrics;
  label: string;
  suffix?: string;
}> = [
  { key: "openWorkOrders", label: "Open work orders" },
  { key: "stalledWorkOrders", label: "Stalled" },
  { key: "overdueApprovals", label: "Overdue approvals" },
  { key: "delayedParts", label: "Delayed parts" },
  { key: "idleTechnicians", label: "Available techs" },
  { key: "readyToInvoice", label: "Ready to invoice" },
  { key: "todaysBookings", label: "Today’s bookings" },
  { key: "shopUtilizationPct", label: "Utilization", suffix: "%" },
];

export default function ShopStateMetricGrid({ metrics }: Props) {
  return (
    <section aria-label="Live shop metrics" className="grid grid-cols-2 gap-2 md:grid-cols-4">
      {METRICS.map((metric) => (
        <div
          key={metric.key}
          className="rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-3"
        >
          <div className="text-2xl font-semibold tabular-nums text-[color:var(--theme-text-primary)]">
            {metrics[metric.key]}
            {metric.suffix ?? ""}
          </div>
          <div className="mt-1 text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-[color:var(--theme-text-secondary)]">
            {metric.label}
          </div>
        </div>
      ))}
    </section>
  );
}
