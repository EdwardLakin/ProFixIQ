"use client";
import Link from "next/link";

export function CalendarWidget({
  data,
  size,
  route,
}: {
  data: { limit: number };
  size: "1x1" | "2x1" | "2x2";
  route: string;
}) {
  const rows = size === "2x2" ? data.limit : size === "2x1" ? Math.min(data.limit, 4) : Math.min(data.limit, 3);
  return (
    <div className="flex w-full flex-col text-left">
      <div className="mb-2 text-sm font-semibold">Today</div>
      <ul className="space-y-1 text-xs">
        {[...Array(rows)].map((_, i) => (
          <li key={i} className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-emerald-400" />
            <span>09:{i}0 • Brake inspection – Bay {i + 1}</span>
          </li>
        ))}
      </ul>
      <Link href={route} className="mt-2 text-[11px] text-white/60 underline">
        Open App →
      </Link>
    </div>
  );
}
