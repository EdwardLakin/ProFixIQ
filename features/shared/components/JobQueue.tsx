//features/shared/components/JobQueue.tsx

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
  const filteredJobs = (
    filterTechId
      ? jobs.filter((job) => (job.assigned_tech_id ?? null) === filterTechId)
      : jobs
  ).slice();

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
    <div className="rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-4 text-[color:var(--theme-text-primary)] shadow-card backdrop-blur-xl">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold tracking-wide text-[var(--accent-copper-light)]">
          {title}
        </h2>
        <div className="flex items-center gap-3 text-xs text-[color:var(--theme-text-secondary)]">
          <span className="rounded-full border border-[color:var(--theme-border-soft)] px-2 py-0.5">
            {filteredJobs.length} job{filteredJobs.length === 1 ? "" : "s"}
          </span>
          {filterTechId && (
            <span className="rounded-full border border-sky-500/40 bg-sky-500/10 px-2 py-0.5 text-sky-200">
              Tech: {activeLabel || filterTechId}
            </span>
          )}
        </div>
      </div>

      {filteredJobs.length === 0 ? (
        <p className="text-sm italic text-[color:var(--theme-text-muted)]">
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
