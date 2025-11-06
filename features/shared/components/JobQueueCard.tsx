"use client";

import { memo, useState } from "react";
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

const BADGE_BASE =
  "inline-flex items-center rounded px-2 py-0.5 text-[10px] font-medium";

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
  holdReason: string | null
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
    assigned_to,
    id,
    status,
    hold_reason,
  } = job;
  const [selectedTech, setSelectedTech] = useState<string | null>(
    assigned_to ?? null
  );

  const { text: badgeText, className: badgeClass } = getStatusBadge(
    status ?? null,
    hold_reason ?? null
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
      className={`border rounded bg-white dark:bg-gray-900 hover:shadow ${
        isActive ? "ring-2 ring-orange-400" : ""
      }`}
    >
      <div className="p-3 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="font-medium truncate">
              {complaint || description || "No description"}
            </div>
            <div className="text-xs text-neutral-500">
              Created: {created_at ? new Date(created_at).toLocaleString() : "—"}
            </div>
            <div className="text-[11px] text-neutral-400 mt-1">
              {selectedTech
                ? `Assigned to: ${selectedTech}`
                : "Assigned to: Unassigned"}
            </div>
          </div>

          <span className={badgeClass}>{badgeText}</span>
        </div>

        {techOptions.length > 0 && onAssignTech && (
          <div className="flex items-center gap-2">
            <select
              value={selectedTech ?? ""}
              onChange={handleAssign}
              className="border rounded px-2 py-1 bg-neutral-50 dark:bg-neutral-800 text-sm"
            >
              <option value="">Unassigned</option>
              {techOptions.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.full_name ?? t.id}
                </option>
              ))}
            </select>

            {onView && (
              <button
                className="px-2 py-1 rounded bg-neutral-700 text-white text-xs"
                onClick={onView}
              >
                View
              </button>
            )}
          </div>
        )}

        {(onPunchIn || onPunchOut) && (
          <div className="flex gap-2">
            {onPunchIn && !isActive && (
              <button
                className="px-3 py-1 rounded bg-blue-600 text-white text-sm"
                onClick={() => void onPunchIn(job)}
              >
                Punch in
              </button>
            )}
            {onPunchOut && isActive && (
              <button
                className="px-3 py-1 rounded bg-gray-700 text-white text-sm"
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