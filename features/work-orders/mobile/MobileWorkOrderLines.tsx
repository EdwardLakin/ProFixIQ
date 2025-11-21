"use client";

import type { Database } from "@shared/types/types/supabase";

type DB = Database;
type Line = DB["public"]["Tables"]["work_order_lines"]["Row"];

export type MobileWorkOrderLinesProps = {
  workOrderId: string;
  lines: Line[];
  onDelete?: (lineId: string) => void;
};

type LineStatus =
  | "awaiting"
  | "in_progress"
  | "on_hold"
  | "paused"
  | "completed";

const STATUS_LABEL: Record<LineStatus, string> = {
  awaiting: "Awaiting",
  in_progress: "In progress",
  on_hold: "On hold",
  paused: "Paused",
  completed: "Completed",
};

const STATUS_CHIP: Record<LineStatus, string> = {
  awaiting:
    "bg-sky-500/10 text-sky-200 border border-sky-400/60",
  in_progress:
    "bg-orange-500/10 text-orange-200 border border-orange-400/70",
  on_hold:
    "bg-amber-500/10 text-amber-200 border border-amber-400/70",
  paused:
    "bg-neutral-700/60 text-neutral-200 border border-neutral-500/80",
  completed:
    "bg-green-500/10 text-green-200 border border-green-400/70",
};

function statusKey(raw: string | null | undefined): LineStatus {
  const key = (raw ?? "awaiting").toLowerCase().replaceAll(" ", "_") as LineStatus;
  if (key in STATUS_LABEL) return key;
  return "awaiting";
}

export function MobileWorkOrderLines({
  workOrderId,
  lines,
  onDelete,
}: MobileWorkOrderLinesProps) {
  if (!lines.length) {
    return (
      <div className="rounded-2xl border border-dashed border-white/15 bg-black/40 p-4 text-[11px] text-neutral-400">
        No job lines yet. Add a job below to get started.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="mb-1 flex items-center justify-between text-[10px] text-neutral-500">
        <span className="uppercase tracking-[0.18em]">
          Jobs ({lines.length})
        </span>
        <span className="font-mono text-[10px] text-neutral-400">
          WO {workOrderId.slice(0, 8)}…
        </span>
      </div>

      {lines.map((line) => {
        const key = statusKey(line.status as string | null | undefined);
        const hasCCC =
          !!line.complaint || !!line.cause || !!line.correction;

        return (
          <div
            key={line.id}
            className="rounded-2xl border border-white/10 bg-black/70 px-3 py-2.5 text-[11px] text-neutral-100 shadow-md shadow-black/50"
          >
            <div className="mb-1 flex items-start justify-between gap-2">
              <div className="flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="inline-flex min-w-0 flex-1 items-center gap-1 truncate text-[11px] font-medium text-neutral-50">
                    {line.description || line.complaint || "Job"}
                  </span>
                </div>
                {line.job_type && (
                  <div className="mt-0.5 text-[10px] uppercase tracking-[0.16em] text-neutral-500">
                    {String(line.job_type).replaceAll("_", " ")}
                  </div>
                )}
              </div>

              <div className="flex flex-col items-end gap-1">
                <span
                  className={
                    "inline-flex items-center rounded-full px-2 py-0.5 text-[9px] font-medium uppercase tracking-[0.16em] " +
                    STATUS_CHIP[key]
                  }
                >
                  {STATUS_LABEL[key]}
                </span>
                {typeof line.labor_time === "number" && (
                  <span className="text-[10px] text-neutral-300">
                    {line.labor_time.toFixed(1)}h
                  </span>
                )}
              </div>
            </div>

            {hasCCC && (
              <div className="mt-1 space-y-1 rounded-xl border border-neutral-800 bg-neutral-950/70 px-2 py-2">
                {line.complaint && (
                  <div>
                    <span className="mr-1 text-[10px] font-semibold text-red-300">
                      C/O:
                    </span>
                    <span className="text-[10px] text-neutral-200">
                      {line.complaint}
                    </span>
                  </div>
                )}
                {line.cause && (
                  <div>
                    <span className="mr-1 text-[10px] font-semibold text-amber-300">
                      Cause:
                    </span>
                    <span className="text-[10px] text-neutral-200">
                      {line.cause}
                    </span>
                  </div>
                )}
                {line.correction && (
                  <div>
                    <span className="mr-1 text-[10px] font-semibold text-emerald-300">
                      Correction:
                    </span>
                    <span className="text-[10px] text-neutral-200">
                      {line.correction}
                    </span>
                  </div>
                )}
              </div>
            )}

            <div className="mt-2 flex items-center justify-between text-[10px] text-neutral-500">
              <div className="flex items-center gap-2">
                {line.priority != null && (
                  <span className="rounded-full border border-neutral-700 px-1.5 py-0.5 text-[9px]">
                    Priority {line.priority}
                  </span>
                )}
                {line.user_id && (
                  <span className="rounded-full border border-neutral-700 px-1.5 py-0.5 text-[9px]">
                    Tech: {line.user_id.slice(0, 6)}
                  </span>
                )}
              </div>
              {onDelete && (
                <button
                  type="button"
                  onClick={() => onDelete(line.id)}
                  className="rounded-full border border-red-500/70 px-2 py-0.5 text-[9px] font-medium text-red-200 hover:bg-red-900/40"
                >
                  Remove
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
