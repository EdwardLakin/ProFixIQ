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
  title = "Work Order Queue",
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

  return (
    <div className="p-4">
      <h2 className="text-xl font-semibold mb-4 text-white">{title}</h2>

      {filteredJobs.length === 0 ? (
        <p className="text-sm text-gray-400 italic">No jobs available.</p>
      ) : (
        <div className="space-y-4">
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