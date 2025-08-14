// app/tech/queue/page.tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

import JobQueue from "@shared/components/JobQueue";
import type { QueueJob } from "@work-orders/components/workorders/queueTypes";
import { getQueuedJobsForTech } from "@work-orders/lib/work-orders/getQueuedJobsForTech";

export default function TechQueuePage() {
  const supabase = createClientComponentClient<Database>();
  const router = useRouter();

  const [jobs, setJobs] = useState<QueueJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [tech, setTech] = useState<{ id: string; full_name: string | null } | null>(null);

  useEffect(() => {
    void fetchJobsAndProfile();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function fetchJobsAndProfile() {
    setLoading(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setLoading(false);
      return;
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("id, full_name")
      .eq("id", user.id)
      .single();

    if (profile) {
      setTech({ id: profile.id, full_name: profile.full_name });
    }

    // ✅ returns QueueJob[] already normalized
    const result = await getQueuedJobsForTech(supabase, { techId: profile?.id });
    setJobs(result);
    setLoading(false);
  }

  const handleAssignTech = async (jobId: string, techId: string) => {
    await supabase.from("work_order_lines").update({ assigned_to: techId }).eq("id", jobId);
    void fetchJobsAndProfile();
  };

  if (loading) return <p className="p-4 text-white">Loading jobs...</p>;

  return (
    <div className="p-4">
      <h1 className="mb-4 text-2xl font-bold text-white">Your Assigned Jobs</h1>

      <JobQueue
        jobs={jobs}
        techOptions={tech ? [tech] : []}
        onAssignTech={handleAssignTech}
        onView={(job) =>
          job.work_order_id && router.push(`/work-orders/view/${job.work_order_id}`)
        }
        filterTechId={tech?.id || null}
        title="Assigned Job Queue"
      />
    </div>
  );
}