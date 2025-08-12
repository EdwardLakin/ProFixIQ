// app/manager/ManagerJobDashboard.tsx
"use client";

import { useEffect, useState } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { Database } from "@shared/types/types/supabase";
import JobQueueCard from "@shared/components/JobQueueCard";
import type { QueueJob } from "@shared/components/JobQueue";
import { format } from "date-fns";

const supabase = createBrowserClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

// DB row shape we fetch for this page
type QueueJobFromDB = Database["public"]["Tables"]["work_order_lines"]["Row"] & {
  // depending on your select, this can be an object or an array; we'll handle both
  vehicles?: Database["public"]["Tables"]["vehicles"]["Row"] | Database["public"]["Tables"]["vehicles"]["Row"][] | null;
  inspections?: Database["public"]["Tables"]["inspections"]["Row"][] | null;
  assigned_to?: { id: string | null; full_name: string | null } | null;
};

// Adapt a DB row -> UI job expected by JobQueue/JobQueueCard
function toQueueJob(row: QueueJobFromDB): QueueJob {
  // Normalize vehicle: take first if it's an array; handle nulls; convert year to string
  const vRaw =
    Array.isArray(row.vehicles) ? row.vehicles[0] :
    row.vehicles && typeof row.vehicles === "object" ? row.vehicles :
    null;

  const vehicle = vRaw
    ? {
        id: (vRaw as any).id ?? undefined,
        year: (vRaw as any).year != null ? String((vRaw as any).year) : undefined,
        make: (vRaw as any).make ?? undefined,
        model: (vRaw as any).model ?? undefined,
      }
    : undefined;

  // Normalize assigned_to -> string | {id, full_name} | null
  let assigned_to: string | { id: string; full_name: string | null } | null = null;
  if (typeof (row as any).assigned_to === "string") {
    assigned_to = (row as any).assigned_to as string;
  } else if (row.assigned_to?.id) {
    assigned_to = { id: row.assigned_to.id!, full_name: row.assigned_to.full_name ?? null };
  } else {
    assigned_to = null;
  }

  // Spread the row and override the fields that differ in the UI shape
  return {
    ...(row as any),
    vehicles: vehicle,   // UI expects a single object with string fields
    assigned_to,         // UI expects union type
  } as QueueJob;
}

export default function ManagerJobDashboard() {
  const [jobs, setJobs] = useState<QueueJobFromDB[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAllJobs();
  }, []);

  async function fetchAllJobs() {
    setLoading(true);
    const { data, error } = await supabase
      .from("work_order_lines")
      .select(`
        *,
        vehicles(*),
        inspections(*),
        assigned_to:assigned_tech_id(id, full_name)
      `)
      .order("created_at", { ascending: true });

    if (error) {
      console.error("Error fetching all jobs:", error);
    } else {
      setJobs((data as QueueJobFromDB[]) || []);
    }

    setLoading(false);
  }

  function groupJobsByStatus(all: QueueJobFromDB[]) {
    const groups: Record<string, QueueJobFromDB[]> = {
      awaiting: [],
      in_progress: [],
      on_hold: [],
      completed: [],
    };
    for (const job of all) {
      const status = job.status || "awaiting";
      (groups[status] ?? groups.awaiting).push(job);
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
                  <div key={job.id} className="mb-4 border rounded-lg shadow-card bg-surface p-4">
                    <JobQueueCard
                      job={uiJob}
                      techOptions={[]}      // fill with techs when you have them
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
                );
              })
            )}
          </div>
        ))}
    </div>
  );
}