// app/tech/queue/page.tsx
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

import JobQueue from "@shared/components/JobQueue";
import { getQueuedJobsForTech } from "@/features/work-orders/lib/work-orders/getQueuedJobsForTech";

type DB = Database;
type JobLine = DB["public"]["Tables"]["work_order_lines"]["Row"];
type TechOption = { id: string; full_name: string | null };

type QueueBucket = "awaiting" | "in_progress" | "on_hold" | "completed";

function toBucket(status: string | null): QueueBucket {
  const s = (status ?? "").toLowerCase();
  if (s === "in_progress") return "in_progress";
  if (s === "on_hold") return "on_hold";
  if (s === "completed") return "completed";
  return "awaiting";
}

export default function TechQueuePage(): JSX.Element {
  const supabase = createClientComponentClient<Database>();
  const router = useRouter();

  const [jobs, setJobs] = useState<JobLine[]>([]);
  const [tech, setTech] = useState<TechOption | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeBucket, setActiveBucket] = useState<QueueBucket | null>(null);

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

      // get the tech's profile (id + name)
      const { data: profile } = await supabase
        .from("profiles")
        .select("id, full_name")
        .eq("id", user.id)
        .single();

      if (!profile) {
        setTech(null);
        setJobs([]);
        setLoading(false);
        return;
      }

      setTech({ id: profile.id, full_name: profile.full_name });

      // this returns assigned-to-me OR unassigned
      const result = await getQueuedJobsForTech(profile.id);

      // 👇 but on THIS page we only want the jobs actually assigned to THIS tech
      const mineOnly = result.filter((row) => (row.assigned_to ?? null) === profile.id);

      setJobs(mineOnly);
    } catch (err: unknown) {
      console.error(err);
      setJobs([]);
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    void fetchJobsAndProfile();
  }, [fetchJobsAndProfile]);

  // counts for the 4 tiles (based on tech-only jobs)
  const counts = useMemo(() => {
    const base: Record<QueueBucket, number> = {
      awaiting: 0,
      in_progress: 0,
      on_hold: 0,
      completed: 0,
    };
    for (const j of jobs) {
      const b = toBucket(j.status ?? null);
      base[b] += 1;
    }
    return base;
  }, [jobs]);

  // apply bucket filter
  const filteredJobs = useMemo(() => {
    if (!activeBucket) return jobs;
    return jobs.filter((j) => toBucket(j.status ?? null) === activeBucket);
  }, [jobs, activeBucket]);

  const handleAssignTech = async (jobId: string, techId: string) => {
    await supabase.from("work_order_lines").update({ assigned_to: techId }).eq("id", jobId);
    // re-fetch to reapply the "mine only" filter
    void fetchJobsAndProfile();
  };

  if (loading) return <p className="p-4 text-white">Loading jobs...</p>;

  return (
    <div className="p-4 text-white">
      <h1 className="mb-4 text-2xl font-bold">Your Assigned Jobs</h1>

      {/* filter tiles */}
      <div className="mb-5 grid gap-3 sm:grid-cols-4">
        {(
          [
            ["awaiting", "Awaiting"] as const,
            ["in_progress", "In progress"] as const,
            ["on_hold", "On hold"] as const,
            ["completed", "Completed"] as const,
          ] satisfies Array<[QueueBucket, string]>
        ).map(([key, label]) => {
          const isActive = activeBucket === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => setActiveBucket((prev) => (prev === key ? null : key))}
              className={`rounded border p-3 text-left transition ${
                isActive
                  ? "border-orange-400 bg-orange-500/10"
                  : "border-neutral-800 bg-neutral-900 hover:border-orange-400"
              }`}
            >
              <div className="text-xs uppercase tracking-wide text-neutral-300">
                {label}
              </div>
              <div className="mt-1 text-2xl font-semibold">{counts[key]}</div>
              {isActive ? (
                <div className="mt-1 text-[10px] text-orange-200">Showing this status</div>
              ) : null}
            </button>
          );
        })}
      </div>

      <JobQueue
        jobs={filteredJobs}
        // techOptions: just themself, so the select shows their name
        techOptions={tech ? [tech] : []}
        onAssignTech={handleAssignTech}
        onView={(job) =>
          job.work_order_id ? router.push(`/work-orders/${job.work_order_id}?mode=tech`) : undefined
        }
        // defensively keep the filter in the list too
        filterTechId={tech?.id ?? null}
        title="Assigned Job Queue"
      />
    </div>
  );
}