"use client";

import { useEffect, useState } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { Database } from "@shared/types/supabase";
import JobQueueCard from "@shared/components/JobQueueCard";
import { format } from "date-fns";

const supabase = createBrowserClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

// ✅ Match shape used in JobQueueCard
type JobLine = Database["public"]["Tables"]["work_order_lines"]["Row"] & {
  assigned_to?: {
    id: string | null;
    full_name: string | null;
  };
};

export default function ManagerJobDashboard() {
  const [jobs, setJobs] = useState<JobLine[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAllJobs();
  }, []);

  async function fetchAllJobs() {
    setLoading(true);
    const { data, error } = await supabase
      .from("work_order_lines")
      .select(
        "*, vehicles(*), inspections(*), assigned_to:assigned_tech_id(id, full_name)",
      )
      .order("created_at", { ascending: true });

    if (error) {
      console.error("Error fetching all jobs:", error);
    } else {
      setJobs(data || []);
    }

    setLoading(false);
  }

  function groupJobsByStatus(jobs: JobLine[]) {
    const groups: Record<string, JobLine[]> = {
      awaiting: [],
      in_progress: [],
      on_hold: [],
      completed: [],
    };

    for (const job of jobs) {
      const status = job.status || "awaiting";
      groups[status]?.push(job);
    }

    return groups;
  }

  const grouped = groupJobsByStatus(jobs);

  return (
    <div className="p-4 max-w-5xl mx-auto">
      <h1 className="text-2xl font-bold mb-4 text-accent">
        Manager Job Dashboard
      </h1>

      {loading && <p>Loading jobs...</p>}

      {!loading &&
        Object.entries(grouped).map(([status, group]) => (
          <div key={status} className="mb-6">
            <h2 className="text-lg font-semibold mb-2 capitalize">
              {status.replaceAll("_", " ")}
            </h2>
            {group.length === 0 ? (
              <p className="text-muted">No jobs in this group.</p>
            ) : (
              group.map((job) => (
                <div
                  key={job.id}
                  className="mb-4 border rounded-lg shadow-card bg-surface p-4"
                >
                  <JobQueueCard
                    job={job}
                    techOptions={[]} // Fill this if you have tech list
                    onAssignTech={() => {}}
                    onView={() => {}}
                  />
                  {job.punched_in_at && (
                    <p className="text-sm text-muted mt-1">
                      Punched In: {format(new Date(job.punched_in_at), "PPpp")}
                    </p>
                  )}
                  {job.status === "on_hold" && job.hold_reason && (
                    <p className="text-sm text-yellow-600">
                      Hold Reason: {job.hold_reason}
                    </p>
                  )}
                </div>
              ))
            )}
          </div>
        ))}
    </div>
  );
}
