"use client";

import type { PartsRequestWorkbenchItem } from "./types";

function money(value: number): string {
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
  }).format(value);
}

function isReceived(status?: string | null): boolean {
  return ["received", "complete", "completed"].includes(String(status ?? "").toLowerCase());
}

function isOrdered(status?: string | null): boolean {
  return ["ordered", "on_po", "po_created"].includes(String(status ?? "").toLowerCase());
}

function isPartial(status?: string | null): boolean {
  return ["partial", "partially_received", "receiving"].includes(String(status ?? "").toLowerCase());
}

export function PartsRequestWorkbenchSummary({
  items,
}: {
  items: PartsRequestWorkbenchItem[];
}): JSX.Element {
  const totalEstimated = items.reduce(
    (sum, item) => sum + item.qty * Math.max(0, item.sellPrice ?? 0),
    0,
  );

  const received = items.filter((item) => isReceived(item.status)).length;
  const ordered = items.filter((item) => isOrdered(item.status)).length;
  const partial = items.filter((item) => isPartial(item.status)).length;
  const waiting = Math.max(0, items.length - received - ordered - partial);

  const stats = [
    ["Total items", items.length],
    ["Waiting / needs order", waiting],
    ["Ordered", ordered],
    ["Partial / receiving", partial],
    ["Received", received],
    ["Total estimated", money(totalEstimated)],
  ];

  return (
    <div className="grid gap-3 rounded-2xl border border-[color:var(--desktop-border)] bg-[color:var(--desktop-panel-bg-soft)] p-4 sm:grid-cols-2 lg:grid-cols-6">
      {stats.map(([label, value]) => (
        <div key={label} className="border-b border-white/5 pb-2 lg:border-b-0 lg:border-r lg:pr-3 last:border-r-0">
          <div className="text-xs text-neutral-400">{label}</div>
          <div className="mt-1 text-xl font-semibold text-white">{value}</div>
        </div>
      ))}
    </div>
  );
}
