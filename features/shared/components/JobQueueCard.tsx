"use client";

import { memo, useMemo, useState } from "react";
import type { Database } from "@shared/types/types/supabase";

type JobLine = Database["public"]["Tables"]["work_order_lines"]["Row"];

type AssignProps = {
  techOptions?: { id: string; full_name: string | null }[];
  onAssignTech?: (jobId: string, techId: string) => void | Promise<void>;
  onView?: () => void;
};

type PunchProps = {
  onPunchIn?: (job: JobLine) => void | Promise<void>;
  onPunchOut?: (job: JobLine) => void | Promise<void>;
};

type JobQueueCardProps = {
  job: JobLine;
  isActive?: boolean;
} & AssignProps &
  PunchProps;

// Possible waiter flags that might exist on the line row
type JobWaiterFlags = {
  is_waiter?: boolean | null;
  waiter?: boolean | null;
  customer_waiting?: boolean | null;
};

const BADGE_BASE =
  "inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-medium";

const STATUS_STYLES: Record<string, string> = {
  in_progress: `${BADGE_BASE} bg-orange-500/10 text-orange-200 border border-orange-400/40`,
  on_hold: `${BADGE_BASE} bg-amber-500/10 text-amber-100 border border-amber-400/40`,
  queued: `${BADGE_BASE} bg-indigo-500/10 text-indigo-100 border border-indigo-400/40`,
  awaiting: `${BADGE_BASE} bg-slate-500/10 text-slate-100 border border-slate-400/40`,
  planned: `${BADGE_BASE} bg-purple-500/10 text-purple-100 border border-purple-400/40`,
  new: `${BADGE_BASE} bg-neutral-500/10 text-neutral-100 border border-neutral-400/40`,
  completed: `${BADGE_BASE} bg-green-500/10 text-green-100 border border-green-400/40`,
};

function getStatusBadge(
  status: string | null,
  holdReason: string | null,
): { text: string; className: string } {
  const key = (status ?? "awaiting").toLowerCase();
  if (key === "on_hold") {
    return {
      text: holdReason ? `On hold — ${holdReason}` : "On hold",
      className: STATUS_STYLES.on_hold ?? STATUS_STYLES.awaiting,
    };
  }
  const base = STATUS_STYLES[key] ?? STATUS_STYLES.awaiting;
  return {
    text: (status ?? "awaiting").replaceAll("_", " "),
    className: base,
  };
}

function JobQueueCard({
  job,
  techOptions = [],
  onAssignTech,
  onView,
  onPunchIn,
  onPunchOut,
  isActive,
}: JobQueueCardProps) {
  const {
    complaint,
    description,
    created_at,
    assigned_tech_id,
    id,
    status,
    hold_reason,
  } = job;

  const [selectedTech, setSelectedTech] = useState<string | null>(
    assigned_tech_id ?? null,
  );

  const assignedLabel = useMemo(() => {
    if (!selectedTech) return "Unassigned";
    const match = techOptions.find((t) => t.id === selectedTech);
    return match?.full_name || selectedTech;
  }, [selectedTech, techOptions]);

  const { text: badgeText, className: badgeClass } = getStatusBadge(
    status ?? null,
    hold_reason ?? null,
  );

  // 🔴 waiter flag per job line (supports multiple possible columns)
  const waiterSource = job as JobLine & JobWaiterFlags;
  const isWaiter =
    !!(
      waiterSource.is_waiter ||
      waiterSource.waiter ||
      waiterSource.customer_waiting
    );

  const handleAssign = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const techId = e.target.value || null;
    setSelectedTech(techId);
    if (techId && onAssignTech && id) {
      void onAssignTech(id, techId);
    }
  };

  return (
    <div
      className={`rounded-xl border bg-neutral-950/90 p-3 shadow-sm transition hover:border-orange-500/70 hover:shadow-md ${
        isActive
          ? "border-orange-400 ring-1 ring-orange-400/70"
          : "border-neutral-800"
      }`}
    >
      <div className="space-y-2">
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-white">
              {complaint || description || "No description"}
            </div>
            <div className="mt-0.5 text-[11px] text-neutral-400">
              Created:{" "}
              {created_at ? new Date(created_at).toLocaleString() : "—"}
            </div>
            <div className="mt-1 text-[11px] text-neutral-400">
              <span className="text-neutral-500">Assigned:</span>{" "}
              <span className="font-medium text-neutral-200">
                {assignedLabel}
              </span>
            </div>
          </div>

          <div className="flex flex-col items-end gap-1">
            {isWaiter && (
              <span
                className="
                  inline-flex items-center whitespace-nowrap
                  rounded-full border border-red-500
                  bg-red-500/10
                  px-3 py-1
                  text-[10px] font-semibold uppercase tracking-[0.16em]
                  text-red-200
                  shadow-[0_0_14px_rgba(248,113,113,0.9)]
                "
              >
                Waiter
              </span>
            )}
            <span className={badgeClass}>{badgeText}</span>
          </div>
        </div>

        {/* Tech assign + view */}
        {(techOptions.length > 0 || onView) && (
          <div className="flex flex-wrap items-center gap-2">
            {techOptions.length > 0 && onAssignTech && (
              <select
                value={selectedTech ?? ""}
                onChange={handleAssign}
                className="rounded border border-neutral-700 bg-neutral-900 px-2 py-1 text-xs text-neutral-100 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
              >
                <option value="">Unassigned</option>
                {techOptions.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.full_name ?? t.id}
                  </option>
                ))}
              </select>
            )}

            {onView && (
              <button
                className="rounded border border-neutral-700 bg-neutral-900 px-2 py-1 text-xs text-neutral-100 hover:border-orange-400 hover:bg-neutral-800"
                onClick={onView}
              >
                View work order
              </button>
            )}
          </div>
        )}

        {/* Punch buttons */}
        {(onPunchIn || onPunchOut) && (
          <div className="flex flex-wrap gap-2 pt-1">
            {onPunchIn && !isActive && (
              <button
                className="rounded bg-blue-600 px-3 py-1 text-xs font-semibold text-white hover:bg-blue-500"
                onClick={() => void onPunchIn(job)}
              >
                Punch in
              </button>
            )}
            {onPunchOut && isActive && (
              <button
                className="rounded bg-neutral-700 px-3 py-1 text-xs font-semibold text-white hover:bg-neutral-600"
                onClick={() => void onPunchOut(job)}
              >
                Punch out
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default memo(JobQueueCard);