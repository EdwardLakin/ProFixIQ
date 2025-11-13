"use client";

import JobQueueCard from "./JobQueueCard";
import type { Database } from "@shared/types/types/supabase";

type JobLine = Database["public"]["Tables"]["work_order_lines"]["Row"];

interface JobQueueProps {
  jobs: JobLine[];
  techOptions: { id: string; full_name: string | null }[];
  onAssignTech?: (jobId: string, techId: string) => void | Promise<void>;
  onView?: (job: JobLine) => void;
  filterTechId?: string | null;
  title?: string;
}

const STATUS_ORDER: Record<string, number> = {
  in_progress: 1,
  on_hold: 2,
  queued: 3,
  awaiting: 4,
  planned: 5,
  new: 6,
  completed: 99,
};

export default function JobQueue({
  jobs,
  techOptions,
  onAssignTech,
  onView,
  filterTechId,
  title = "Technician Job Queue",
}: JobQueueProps) {
  const filteredJobs = (filterTechId
    ? jobs.filter((job) => (job.assigned_to ?? null) === filterTechId)
    : jobs
  ).slice(); // shallow copy before sort

  // sort by status priority, then by created_at
  filteredJobs.sort((a, b) => {
    const sa = STATUS_ORDER[String(a.status ?? "").toLowerCase()] ?? 50;
    const sb = STATUS_ORDER[String(b.status ?? "").toLowerCase()] ?? 50;
    if (sa !== sb) return sa - sb;

    const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
    const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
    return ta - tb;
  });

  const activeLabel =
    filterTechId &&
    techOptions.find((t) => t.id === filterTechId)?.full_name;

  return (
    <div className="rounded-2xl border border-neutral-800 bg-neutral-950/80 p-4 text-white shadow-card">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold tracking-wide text-orange-400">
          {title}
        </h2>
        <div className="flex items-center gap-3 text-xs text-neutral-400">
          <span className="rounded-full border border-neutral-700 px-2 py-0.5">
            {filteredJobs.length} job{filteredJobs.length === 1 ? "" : "s"}
          </span>
          {filterTechId && (
            <span className="rounded-full border border-blue-500/60 bg-blue-500/10 px-2 py-0.5 text-blue-200">
              Tech: {activeLabel || filterTechId}
            </span>
          )}
        </div>
      </div>

      {filteredJobs.length === 0 ? (
        <p className="text-sm italic text-neutral-500">
          No jobs in this queue.
        </p>
      ) : (
        <div className="space-y-3">
          {filteredJobs.map((job) => (
            <JobQueueCard
              key={job.id}
              job={job}
              techOptions={techOptions}
              onAssignTech={onAssignTech}
              onView={onView ? () => onView(job) : undefined}
            />
          ))}
        </div>
      )}
    </div>
  );
}