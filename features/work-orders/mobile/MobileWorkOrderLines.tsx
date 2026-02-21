// features/work-orders/mobile/MobileWorkOrderLines.tsx (FULL FILE REPLACEMENT)
// ✅ Theme alignment only (cards/pills closer to MobileTechHome)
// ❗ No logic changes

"use client";

import { useState } from "react";
import type { Database } from "@shared/types/types/supabase";
import AssignTechModal from "@/features/work-orders/components/workorders/extras/AssignTechModal";

type DB = Database;
type WorkOrderLineRow = DB["public"]["Tables"]["work_order_lines"]["Row"];

type Props = {
  lines: WorkOrderLineRow[];
  workOrderId: string | null;
  onDelete: (lineId: string) => Promise<void> | void;
  /** set true from parent when this WO is a waiting / waiter job */
  isWaiter?: boolean;
};

const statusTextColor: Record<string, string> = {
  in_progress:
    "text-[var(--accent-copper-light)] border-[var(--accent-copper-soft)] bg-[rgba(212,118,49,0.14)] shadow-[0_0_16px_rgba(212,118,49,0.35)]",
  awaiting: "text-slate-200 border-slate-300/30 bg-slate-500/10",
  queued: "text-indigo-200 border-indigo-400/40 bg-indigo-500/10",
  on_hold: "text-amber-200 border-amber-400/50 bg-amber-500/10",
  completed: "text-emerald-200 border-emerald-400/60 bg-emerald-500/10",
  paused: "text-amber-200 border-amber-400/50 bg-amber-500/10",
  assigned: "text-sky-200 border-sky-400/50 bg-sky-500/10",
  unassigned: "text-neutral-200 border-neutral-400/40 bg-neutral-700/20",
  awaiting_approval: "text-blue-200 border-blue-400/50 bg-blue-500/10",
  declined: "text-red-200 border-red-500/60 bg-red-500/10",
};

const statusChip = (s: string | null | undefined) => {
  const key = (s ?? "awaiting").toLowerCase().replaceAll(" ", "_");
  return (
    statusTextColor[key] ??
    "text-neutral-200 border-neutral-500/40 bg-neutral-700/20"
  );
};

// waiter pill styling (matches desktop vibe but a bit tighter for mobile)
const waiterPillClasses =
  "inline-flex items-center rounded-full border border-red-500/80 bg-red-500/15 px-2 py-0.5 text-[0.6rem] font-semibold uppercase tracking-[0.16em] text-red-100 shadow-[0_0_10px_rgba(248,113,113,0.75)]";

export function MobileWorkOrderLines({
  lines,
  workOrderId,
  onDelete,
  isWaiter = false,
}: Props): JSX.Element | null {
  const [assignLineId, setAssignLineId] = useState<string | null>(null);
  const [assignOpen, setAssignOpen] = useState(false);

  if (!workOrderId) return null;

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
    <>
      <div className="glass-card rounded-2xl border border-white/12 bg-black/40 px-3 py-3 shadow-card">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-neutral-400">
            Jobs on this work order
          </h2>
          <span className="text-[0.65rem] text-neutral-500">
            {lines.length} line{lines.length === 1 ? "" : "s"}
          </span>
        </div>

        <ul className="space-y-2">
          {lines.map((line, idx) => {
            const label = line.description || line.complaint || "Job line";

            const statusLabel = line.status
              ? line.status.replaceAll("_", " ")
              : "awaiting";

            const canAssign = Boolean(workOrderId);

            return (
              <li
                key={line.id}
                className="group flex items-stretch justify-between gap-2 rounded-2xl border border-white/12 bg-[radial-gradient(circle_at_top,_rgba(148,163,184,0.08),rgba(0,0,0,0.65))] px-3 py-2 text-xs shadow-[0_18px_45px_rgba(0,0,0,0.65)]"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 text-[0.7rem] text-neutral-500">
                    <span className="font-mono text-[0.65rem] text-neutral-500">
                      #{(idx + 1).toString().padStart(2, "0")}
                    </span>

                    {line.job_type && (
                      <span className="rounded-full border border-white/10 bg-black/40 px-1.5 py-0.5 text-[0.6rem] uppercase tracking-[0.16em] text-neutral-300">
                        {String(line.job_type).replaceAll("_", " ")}
                      </span>
                    )}

                    {isWaiter && <span className={waiterPillClasses}>Waiting</span>}
                  </div>

                  <div className="mt-0.5 truncate text-[0.8rem] font-medium text-neutral-50">
                    {label}
                  </div>

                  {line.complaint && (
                    <div className="mt-0.5 line-clamp-2 text-[0.7rem] text-neutral-400">
                      {line.complaint}
                    </div>
                  )}

                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <span
                      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[0.6rem] uppercase tracking-[0.16em] ${statusChip(
                        line.status,
                      )}`}
                    >
                      {statusLabel}
                    </span>

                    {line.assigned_to ? (
                      <span className="inline-flex items-center rounded-full border border-sky-500/30 bg-sky-500/10 px-2 py-0.5 text-[0.6rem] uppercase tracking-[0.16em] text-sky-100">
                        Assigned
                      </span>
                    ) : (
                      <span className="inline-flex items-center rounded-full border border-neutral-500/30 bg-neutral-700/20 px-2 py-0.5 text-[0.6rem] uppercase tracking-[0.16em] text-neutral-200">
                        Unassigned
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex flex-col items-end justify-between gap-1 pl-1">
                  {typeof line.labor_time === "number" && (
                    <span className="rounded-full border border-white/10 bg-black/40 px-2 py-0.5 text-[0.6rem] text-neutral-200">
                      {line.labor_time.toFixed(1)}h
                    </span>
                  )}

                  <div className="flex flex-col items-end gap-1">
                    <button
                      type="button"
                      onClick={() => {
                        if (!canAssign) return;
                        setAssignLineId(line.id);
                        setAssignOpen(true);
                      }}
                      className="shrink-0 rounded-full border border-sky-500/70 bg-black/35 px-2 py-0.5 text-[0.7rem] text-sky-100 hover:bg-sky-500/15 disabled:cursor-not-allowed disabled:opacity-50"
                      disabled={!canAssign}
                      title={
                        canAssign ? "Assign technician" : "Open a work order first"
                      }
                    >
                      Assign
                    </button>

                    <button
                      type="button"
                      onClick={() => onDelete(line.id)}
                      className="shrink-0 rounded-full border border-red-500/70 bg-black/35 px-2 py-0.5 text-[0.7rem] text-red-100 hover:bg-red-500/15"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      {assignOpen && assignLineId && (
        <AssignTechModal
          isOpen={assignOpen}
          onClose={() => setAssignOpen(false)}
          workOrderLineId={assignLineId}
        />
      )}
    </>
  );
}