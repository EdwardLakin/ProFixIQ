// features/shared/components/JobQueue.tsx
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

export default function JobQueue({
  jobs,
  techOptions,
  onAssignTech,
  onView,
  filterTechId,
  title = "Work Order Queue",
}: JobQueueProps) {
  const filteredJobs = filterTechId
    ? jobs.filter((job) => (job.assigned_to ?? null) === filterTechId)
    : jobs;

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
