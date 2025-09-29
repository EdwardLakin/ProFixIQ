"use client";
import Link from "next/link";

export function ReportsKPIWidget({
  data,
  route,
  size,
}: {
  data: { revenueToday: number; jobsDone: number; cycleHrs: number };
  route: string;
  size: "1x1" | "2x1" | "2x2";
}) {
  const fmt = (n: number) => new Intl.NumberFormat().format(n);
  const base = [
    { label: "Revenue", value: `$${fmt(data.revenueToday)}` },
    { label: "Jobs", value: fmt(data.jobsDone) },
    { label: "Cycle Hrs", value: data.cycleHrs.toFixed(1) },
  ];
  // For 2x2 we add placeholders for extra KPIs you can wire later
  const extra = size === "2x2" ? [
    { label: "AOV", value: "$0" },
    { label: "Close %", value: "0%" },
    { label: "Wait Time", value: "0m" },
  ] : [];
  const items = [...base, ...extra];
  const gridCols = size === "2x2" ? "grid-cols-3" : "grid-cols-3";

  return (
    <div className="w-full text-left">
      <div className="mb-2 text-sm font-semibold">Today’s KPIs</div>
      <div className={`grid ${gridCols} gap-2`}>
        {items.map((k) => (
          <div key={k.label} className="rounded bg-white/10 p-2">
            <div className="text-[10px] text-white/70">{k.label}</div>
            <div className="text-sm font-semibold">{k.value}</div>
          </div>
        ))}
      </div>
      <Link href={route} className="mt-2 block text-[11px] text-white/60 underline">
        Open Reports →
      </Link>
    </div>
  );
}
