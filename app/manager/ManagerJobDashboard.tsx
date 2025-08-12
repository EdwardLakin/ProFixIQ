// app/manager/ManagerJobDashboard.tsx
"use client";

import { useEffect, useState } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { Database } from "@shared/types/types/supabase";
import JobQueueCard from "@shared/components/JobQueueCard";
import type { QueueJob } from "@shared/components/JobQueue"; // ← bring in the UI shape
import { format } from "date-fns";

const supabase = createBrowserClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

// DB row with a light join alias for the tech
type JobLine = Database["public"]["Tables"]["work_order_lines"]["Row"] & {
  assigned_to?: { id: string | null; full_name: string | null } | string | null;
  // `vehicles` is already present on the row type as a nested object; we’ll adapt it below
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
        `
        *,
        vehicles ( id, year, make, model ),
        inspections ( * ),
        assigned_to:assigned_tech_id ( id, full_name )
      `,
      )
      .order("created_at", { ascending: true });

    if (error) {
      console.error("Error fetching all jobs:", error);
    } else {
      setJobs(data || []);
    }

    setLoading(false);
  }

  // Adapt a DB row to the QueueJob shape that <JobQueueCard> expects
  function toQueueJob(j: JobLine): QueueJob {
    // normalize assigned_to -> string | {id, full_name} | null
    let normalizedAssigned:
      | string
      | { id: string; full_name: string | null }
      | null = null;

    const at = (j as any).assigned_to;
    if (typeof at === "string") {
      normalizedAssigned = at;
    } else if (at?.id) {
      normalizedAssigned = { id: at.id as string, full_name: at.full_name ?? null };
    } else {
      normalizedAssigned = null;
    }

    // adapt nested vehicles to the partial Vehicle shape
    const v = (j as any).vehicles;
    const vehicles =
      v
        ? {
            id: v.id as string | undefined,
            year: v.year ?? undefined, // your Vehicles.year is a string in types
            make: v.make ?? undefined,
            model: v.model ?? undefined,
          }
        : undefined;

    // return QueueJob (Omit<Row, "assigned_to"> & custom fields)
    return {
      ...(j as Omit<JobLine, "assigned_to">),
      assigned_to: normalizedAssigned,
      vehicles,
    };
  }

  function groupJobsByStatus(all: JobLine[]) {
    const groups: Record<string, JobLine[]> = {
      awaiting: [],
      in_progress: [],
      on_hold: [],
      completed: [],
    };
    for (const job of all) {
      const status = job.status || "awaiting";
      (groups[status] ?? (groups[status] = [])).push(job);
    }
    return groups;
  }

  const grouped = groupJobsByStatus(jobs);

  return (
    <div className="p-4 max-w-5xl mx-auto">
      <h1 className="text-2xl font-bold mb-4 text-accent">Manager Job Dashboard</h1>

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
              group.map((job) => {
                const uiJob = toQueueJob(job);
                return (
                  <div
                    key={job.id}
                    className="mb-4 border rounded-lg shadow-card bg-surface p-4"
                  >
                    <JobQueueCard
                      job={uiJob}
                      techOptions={[]}           // plug real tech list if/when you have it
                      onAssignTech={() => {}}    // no-op placeholder
                      onView={() => {}}          // no-op placeholder
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
                );
              })
            )}
          </div>
        ))}
    </div>
  );
}