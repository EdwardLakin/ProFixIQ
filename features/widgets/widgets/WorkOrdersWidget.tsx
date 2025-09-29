"use client";
import Link from "next/link";

export function WorkOrdersWidget({
  data,
  size,
  route,
}: {
  data: { limit: number };
  size: "1x1" | "2x1" | "2x2";
  route: string;
}) {
  const take = size === "2x2" ? Math.max(6, data.limit) : size === "2x1" ? Math.min(data.limit, 6) : Math.min(data.limit, 3);
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <div className="text-sm font-semibold">My Queue</div>
        <Link href={route} className="text-[11px] underline">Open</Link>
      </div>
      <ul className="space-y-1 text-xs">
        {[...Array(take)].map((_, i) => (
          <li key={i} className="flex items-center justify-between">
            <Link href={`/work-orders/view/${1280 + i}`} className="truncate hover:underline">
              WO-{1280 + i} • F-150 noise diag
            </Link>
            <span className="rounded bg-red-500/20 px-1.5 py-0.5 text-[10px] text-red-300">Urgent</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
