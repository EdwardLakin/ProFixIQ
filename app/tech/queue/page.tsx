// app/tech/queue/page.tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

import JobQueue from "@shared/components/JobQueue";
import { getQueuedJobsForTech } from "@/features/work-orders/lib/work-orders/getQueuedJobsForTech";

type JobLine = Database["public"]["Tables"]["work_order_lines"]["Row"];
type TechOption = { id: string; full_name: string | null };

export default function TechQueuePage() {
  const supabase = createClientComponentClient<Database>();
  const router = useRouter();

  const [jobs, setJobs] = useState<JobLine[]>([]);
  const [tech, setTech] = useState<TechOption | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchJobsAndProfile = useCallback(async () => {
    setLoading(true);
    try {
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

      if (profile) setTech({ id: profile.id, full_name: profile.full_name });

      // helper expects string | undefined
      const result = await getQueuedJobsForTech(profile?.id);
      setJobs(result);
    } catch (err: unknown) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    void fetchJobsAndProfile();
  }, [fetchJobsAndProfile]);

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
        onView={(job) => router.push(`/work-orders/view/${job.work_order_id}`)}
        filterTechId={tech?.id ?? null}
        title="Assigned Job Queue"
      />
    </div>
  );
}