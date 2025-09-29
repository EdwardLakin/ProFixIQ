"use client";
import Link from "next/link";

export function TechQueueWidget({
  data,
  size,
  route,
}: {
  data: { me: string | null; rows: { id: string; label: string; urgent?: boolean }[] };
  size: "1x1" | "2x1" | "2x2";
  route: string;
}) {
  const rows = data.rows ?? [];
  const take = size === "2x2" ? 6 : size === "2x1" ? 5 : 3;

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <div className="text-sm font-semibold">My Jobs</div>
        <Link href={route} className="text-[11px] underline">Open</Link>
      </div>
      <ul className="space-y-1 text-xs">
        {rows.slice(0, take).map((r) => (
          <li key={r.id} className="flex items-center justify-between">
            <Link href={`/work-orders/view/${r.id}`} className="truncate hover:underline">
              {r.label}
            </Link>
            {r.urgent && (
              <span className="rounded bg-red-500/20 px-1.5 py-0.5 text-[10px] text-red-300">Urgent</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
