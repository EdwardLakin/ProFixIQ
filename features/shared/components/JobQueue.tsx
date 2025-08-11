"use client";

import JobQueueCard from "./JobQueueCard";
import type { Database } from "@shared/types/types/supabase";

// Base table rows
type JobLine = Database["public"]["Tables"]["work_order_lines"]["Row"];
type Vehicle = Database["public"]["Tables"]["vehicles"]["Row"];

// Use Omit so we can redefine assigned_to as a union
export type QueueJob = Omit<JobLine, "assigned_to"> & {
  assigned_to: { id: string; full_name: string | null } | string | null;
  vehicles?: Partial<Vehicle> | null;
};

interface JobQueueProps {
  jobs: QueueJob[];
  techOptions: { id: string; full_name: string | null }[];
  onAssignTech: (jobId: string, techId: string) => void;
  onView: (job: QueueJob) => void; // send full job
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
    ? jobs.filter((job) => {
        const assigned =
          typeof job.assigned_to === "string"
            ? job.assigned_to
            : job.assigned_to?.id ?? null;
        return assigned === filterTechId;
      })
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
              onView={() => onView(job)} // pass full job
            />
          ))}
        </div>
      )}
    </div>
  );
}