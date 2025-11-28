// features/work-orders/mobile/MobileWorkOrderLines.tsx
"use client";

import type { Database } from "@shared/types/types/supabase";

type DB = Database;
type WorkOrderLineRow = DB["public"]["Tables"]["work_order_lines"]["Row"];

type Props = {
  lines: WorkOrderLineRow[];
  workOrderId: string | null;
  onDelete: (lineId: string) => Promise<void> | void;
};

export function MobileWorkOrderLines({
  lines,
  workOrderId,
  onDelete,
}: Props) {
  if (!workOrderId) {
    return null;
  }

  if (!lines.length) {
    return (
      <div className="glass-card rounded-2xl border border-dashed border-white/15 bg-black/30 px-3 py-3 text-[0.75rem] text-neutral-300">
        No jobs added yet. Use{" "}
        <span className="font-semibold text-[var(--accent-copper-light)]">
          Add job line
        </span>{" "}
        below to start the quote.
      </div>
    );
  }

  return (
    <div className="glass-card rounded-2xl border border-white/12 bg-black/40 px-3 py-3">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-neutral-400">
          Jobs on this work order
        </h2>
        <span className="text-[0.65rem] text-neutral-500">
          {lines.length} line{lines.length === 1 ? "" : "s"}
        </span>
      </div>

      <ul className="space-y-2">
        {lines.map((line) => {
          const label =
            line.description ||
            line.complaint ||
            "Job line";

          return (
            <li
              key={line.id}
              className="flex items-start justify-between gap-2 rounded-xl border border-white/12 bg-black/45 px-3 py-2 text-xs shadow-card"
            >
              <div className="min-w-0">
                <div className="truncate text-[0.8rem] font-medium text-neutral-50">
                  {label}
                </div>
                {line.complaint && (
                  <div className="mt-0.5 line-clamp-2 text-[0.7rem] text-neutral-400">
                    {line.complaint}
                  </div>
                )}
                {line.status && (
                  <div className="mt-1 text-[0.65rem] uppercase tracking-[0.16em] text-neutral-500">
                    {line.status.replaceAll("_", " ")}
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={() => onDelete(line.id)}
                className="shrink-0 rounded-full border border-red-500/70 px-2 py-0.5 text-[0.7rem] text-red-100 hover:bg-red-500/15"
              >
                Delete
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}