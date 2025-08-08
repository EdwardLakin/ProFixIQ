"use client";

import { memo, useState } from "react";
import type { Database } from "@shared/types/types/supabase";

// Row shape from Supabase
type JobLine = Database["public"]["Tables"]["work_order_lines"]["Row"];

type AssignProps = {
  techOptions: { id: string; full_name: string | null }[];
  onAssignTech: (jobId: string, techId: string) => void;
  onView: (job: JobLine) => void;
};

type PunchProps = {
  onPunchIn?: (job: JobLine) => void | Promise<void>;
  onPunchOut?: (job: JobLine) => void | Promise<void>;
};

type CommonProps = {
  job: JobLine;
  isActive?: boolean;
};

type JobQueueCardProps = CommonProps & Partial<AssignProps> & PunchProps;

function JobQueueCard({
  job,
  techOptions,
  onAssignTech,
  onView,
  onPunchIn,
  onPunchOut,
  isActive,
}: JobQueueCardProps) {
  const { complaint, created_at, assigned_to, id } = job;

  const [selectedTech, setSelectedTech] = useState<string | null>(
    assigned_to ?? null
  );

  const handleAssign = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const techId = e.target.value || null;
    setSelectedTech(techId);
    if (techId && onAssignTech) onAssignTech(id!, techId);
  };

  return (
    <div
      className={`border rounded shadow-sm bg-white dark:bg-gray-900 hover:shadow ${
        isActive ? "ring-2 ring-orange-400" : ""
      }`}
    >
      <div className="p-3">
        <div className="font-medium">{complaint ?? "No complaint"}</div>
        <div className="text-xs text-neutral-500">
          Created: {new Date(created_at ?? "").toLocaleString()}
        </div>

        {/* Tech assign UI (only if props provided) */}
        {techOptions && onAssignTech && (
          <div className="mt-2">
            <select
              value={selectedTech ?? ""}
              onChange={handleAssign}
              className="border rounded px-2 py-1 bg-neutral-50 dark:bg-neutral-800"
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
                className="ml-2 px-2 py-1 rounded bg-neutral-700 text-white"
                onClick={() => onView(job)}
              >
                View
              </button>
            )}
          </div>
        )}

        {/* Punch controls (only if handlers provided) */}
        {(onPunchIn || onPunchOut) && (
          <div className="mt-3 flex gap-2">
            {onPunchIn && !isActive && (
              <button
                className="px-3 py-1 rounded bg-blue-600 text-white"
                onClick={() => onPunchIn(job)}
              >
                Punch in
              </button>
            )}
            {onPunchOut && isActive && (
              <button
                className="px-3 py-1 rounded bg-gray-700 text-white"
                onClick={() => onPunchOut(job)}
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