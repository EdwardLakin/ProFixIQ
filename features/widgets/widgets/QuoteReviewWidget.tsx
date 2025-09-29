"use client";
import Link from "next/link";

export function QuoteReviewWidget({
  data,
  size,
  route,
}: {
  data: { total: number; items: { id: string; title: string }[] };
  size: "1x1" | "2x1" | "2x2";
  route: string;
}) {
  const { total, items } = data;
  const take = size === "2x2" ? 6 : size === "2x1" ? 4 : 3;

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <div className="text-sm font-semibold">Quote Review</div>
        <Link href={route} className="text-[11px] underline">Open</Link>
      </div>
      <div className="mb-2 text-xs">
        Pending: <span className="font-semibold">{total}</span>
      </div>
      <ul className="space-y-1 text-xs">
        {(items ?? []).slice(0, take).map((it) => (
          <li key={it.id} className="flex justify-between">
            <Link href={`/work-orders/quote-review?id=${it.id}`} className="truncate hover:underline">
              {it.title}
            </Link>
            <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] text-amber-300">Review</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
