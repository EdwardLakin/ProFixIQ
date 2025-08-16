// features/shared/components/JobQueue.tsx
"use client";

import JobQueueCard from "@shared/components/JobQueueCard";
import type { Database } from "@shared/types/types/supabase";

type JobLine = Database["public"]["Tables"]["work_order_lines"]["Row"];

type Props = {
  title: string;
  jobs: JobLine[];
  techOptions?: { id: string; full_name: string | null }[];
  onAssignTech?: (jobId: string, techId: string) => void;
  onView?: (job: JobLine) => void;
};

export default function JobQueue({
  title,
  jobs,
  techOptions,
  onAssignTech,
  onView,
}: Props) {
  const filteredJobs = jobs.filter((job) => job.status === "queued"); // or whatever filter you want

  return (
    <div className="p-4">
      <h2 className="text-xl font-semibold mb-4 text-white">{title}</h2>

      {filteredJobs.length === 0 ? (
        <p className="text-sm text-gray-400">No jobs available.</p>
      ) : (
        <div className="space-y-4">
          {filteredJobs.map((job) => (
            <JobQueueCard
              key={job.id}
              job={job}
              techOptions={techOptions}
              onAssignTech={onAssignTech}
              onView={onView}
            />
          ))}
        </div>
      )}
    </div>
  );
}