// app/tech/queue/page.tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import JobQueue from "@shared/components/JobQueue";
import type { Database } from "@shared/types/types/supabase";
import type { QueueJob } from "@work-orders/components/workorders/queueTypes";

type JobLineRow = Database["public"]["Tables"]["work_order_lines"]["Row"] & {
  // optional joins your RLS/view may expose
  assigned_to?: { id?: string | null; full_name?: string | null } | string | null;
  vehicles?: { year?: number | null; make?: string | null; model?: string | null } | null;
};

type TechOption = { id: string; full_name: string | null };

export default function TechQueuePage() {
  const supabase = createClientComponentClient<Database>();
  const router = useRouter();

  const [rows, setRows] = useState<JobLineRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [tech, setTech] = useState<TechOption | null>(null);

  useEffect(() => {
    (async () => {
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

      // Broad pull; your RLS/view can expose vehicles and assigned_to
      const { data } = await supabase
        .from("work_order_lines")
        .select("*")
        .or(`assigned_to.eq.${user.id},assigned_to.is.null`)
        .in("status", ["awaiting", "in_progress", "on_hold"])
        .order("created_at", { ascending: true });

      setRows((data ?? []) as JobLineRow[]);
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toQueueJob = (j: JobLineRow): QueueJob => {
    // QueueJob.vehicles is non-nullable -> always return an object with nullable fields
    const vehicles: QueueJob["vehicles"] = {
      year: j.vehicles?.year ?? null,
      make: j.vehicles?.make ?? null,
      model: j.vehicles?.model ?? null,
    };

    let assigned_to: QueueJob["assigned_to"] = null;
    const maybeAssigned = j.assigned_to;

    if (typeof maybeAssigned === "string") {
      assigned_to = maybeAssigned;
    } else if (maybeAssigned && typeof maybeAssigned === "object" && maybeAssigned.id) {
      assigned_to = { id: maybeAssigned.id!, full_name: maybeAssigned.full_name ?? null };
    } else {
      assigned_to = null;
    }

    return {
      // pass through common fields from your Row
      id: (j as any).id,
      work_order_id: (j as any).work_order_id ?? null,
      complaint: (j as any).complaint ?? null,
      status: (j as any).status,
      created_at: (j as any).created_at,
      updated_at: (j as any).updated_at,
      hold_reason: (j as any).hold_reason ?? null,
      punched_in_at: (j as any).punched_in_at ?? null,
      punched_out_at: (j as any).punched_out_at ?? null,
      vehicles,
      assigned_to,
    } as QueueJob;
  };

  const uiJobs: QueueJob[] = rows.map(toQueueJob);

  const handleAssignTech = async (jobId: string, techId: string) => {
    await supabase.from("work_order_lines").update({ assigned_to: techId }).eq("id", jobId);
    // refresh list
    const { data } = await supabase.from("work_order_lines").select("*");
    setRows((data ?? []) as JobLineRow[]);
  };

  if (loading) return <p className="p-4 text-white">Loading jobs...</p>;

  // ✅ Avoid never[] inference
  const techOptions: TechOption[] = tech ? [tech] : [];

  return (
    <div className="p-4">
      <h1 className="mb-4 text-2xl font-bold text-white">Your Assigned Jobs</h1>

      <JobQueue
        jobs={uiJobs}
        techOptions={techOptions}
        onAssignTech={handleAssignTech}
        onView={(job) => job.work_order_id && router.push(`/work-orders/view/${job.work_order_id}`)}
        filterTechId={tech?.id || null}
        title="Assigned Job Queue"
      />
    </div>
  );
}