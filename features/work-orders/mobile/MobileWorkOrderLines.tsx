//Features/work-orders/mobile/MobileWorkOrderLines.tsx
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
      <div className="rounded-xl border border-dashed border-neutral-700 bg-neutral-950/60 px-3 py-3 text-xs text-neutral-400">
        No jobs added yet. Use{" "}
        <span className="font-semibold text-neutral-200">
          Add job line
        </span>{" "}
        below to start the quote.
      </div>
    );
  }

  return (
    <div className="space-y-2 rounded-xl border border-neutral-800 bg-neutral-950 p-3">
      <div className="mb-1 flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
          Jobs on this work order
        </h2>
        <span className="text-[10px] text-neutral-500">
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
              className="flex items-start justify-between gap-2 rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-2 text-xs"
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
                  <div className="mt-1 text-[0.65rem] uppercase tracking-wide text-neutral-500">
                    {line.status.replaceAll("_", " ")}
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={() => onDelete(line.id)}
                className="shrink-0 rounded-full border border-red-500/60 px-2 py-0.5 text-[0.7rem] text-red-200 hover:bg-red-900/30"
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