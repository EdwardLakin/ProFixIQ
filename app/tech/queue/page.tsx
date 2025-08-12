// app/tech/queue/page.tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";

import JobQueue from "@shared/components/JobQueue";
import { getQueuedJobsForTech } from "@work-orders/lib/work-orders/getQueuedJobsForTech";
import type { Database } from "@shared/types/types/supabase";

type JobLineRow = Database["public"]["Tables"]["work_order_lines"]["Row"] & {
  // your join adds this shape on the row
  assigned_to?: { id?: string | null; full_name?: string | null } | null;
};

export default function TechQueuePage() {
  const supabase = createClientComponentClient<Database>();
  const router = useRouter();

  const [jobs, setJobs] = useState<JobLineRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [tech, setTech] = useState<{ id: string; full_name: string | null } | null>(null);

  useEffect(() => {
    fetchJobsAndProfile();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function fetchJobsAndProfile() {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const { data: profile } = await supabase
      .from("profiles")
      .select("id, full_name")
      .eq("id", user.id)
      .single();

    if (profile) setTech({ id: profile.id, full_name: profile.full_name });

    const result = await getQueuedJobsForTech();
    setJobs(result as JobLineRow[]);
    setLoading(false);
  }

  const handleAssignTech = async (jobId: string, techId: string) => {
    await supabase.from("work_order_lines").update({ assigned_to: techId }).eq("id", jobId);
    fetchJobsAndProfile();
  };

  if (loading) return <p className="p-4 text-white">Loading jobs...</p>;

  // Adapter: DB row -> <JobQueue> props
  const uiJobs = jobs.map((j) => {
    // Convert DB `vehicles` (year: number|null) -> UI `vehicles` (string fields)
    const targetVehicles =
      j.vehicles
        ? {
            id: j.vehicle_id ?? undefined,
            year: j.vehicles.year != null ? String(j.vehicles.year) : undefined,
            make: j.vehicles.make ?? undefined,
            model: j.vehicles.model ?? undefined,
          }
        : undefined;

    // Normalize assigned_to -> string | {id, full_name} | null
    let assigned_to: string | { id: string; full_name: string | null } | null = null;
    const maybeAssigned = (j as unknown as { assigned_to?: string | JobLineRow["assigned_to"] }).assigned_to;
    if (typeof maybeAssigned === "string") {
      assigned_to = maybeAssigned;
    } else if (j.assigned_to?.id) {
      assigned_to = { id: j.assigned_to.id!, full_name: j.assigned_to.full_name ?? null };
    } else {
      assigned_to = null;
    }

    // Spread row but override `vehicles` with our targetVehicles
    return {
      ...j,
      vehicles: targetVehicles,
      assigned_to,
    };
  });

  return (
    <div className="p-4">
      <h1 className="mb-4 text-2xl font-bold text-white">Your Assigned Jobs</h1>

      <JobQueue
        jobs={uiJobs}
        techOptions={tech ? [tech] : []}
        onAssignTech={handleAssignTech}
        onView={(job) => job.work_order_id && router.push(`/work-orders/view/${job.work_order_id}`)}
        filterTechId={tech?.id || null}
        title="Assigned Job Queue"
      />
    </div>
  );
}