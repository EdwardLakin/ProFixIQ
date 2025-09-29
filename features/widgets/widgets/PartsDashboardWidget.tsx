"use client";
import Link from "next/link";

export function PartsDashboardWidget({
  data,
  route,
  size,
}: {
  data: { inventory: number; backorders: number; returns: number };
  route: string;
  size: "1x1" | "2x1" | "2x2";
}) {
  const kpis = [
    { label: "Inventory", value: data.inventory, href: "/parts/inventory" },
    { label: "Backorders", value: data.backorders, href: "/parts" },
    { label: "Returns", value: data.returns, href: "/parts/returns" },
  ];
  // Use size to decide layout density
  const gridCols = size === "2x2" ? "grid-cols-3" : size === "2x1" ? "grid-cols-3" : "grid-cols-2";

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <div className="text-sm font-semibold">Parts</div>
        <Link href={route} className="text-[11px] underline">Open</Link>
      </div>
      <div className={`grid ${gridCols} gap-2 text-center`}>
        {kpis.slice(0, gridCols === "grid-cols-2" ? 2 : 3).map((k) => (
          <Link key={k.label} href={k.href} className="rounded bg-white/10 p-2 hover:bg-white/15">
            <div className="text-[10px] text-white/70">{k.label}</div>
            <div className="text-sm font-semibold">{k.value}</div>
          </Link>
        ))}
      </div>
    </div>
  );
}
