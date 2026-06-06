// features/work-orders/components/workorders/TechJobScreen.tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import { createBrowserSupabase } from "@/features/shared/lib/supabase/client";
import type { Database } from "@shared/types/types/supabase";
import JobQueueCard from "@shared/components/JobQueueCard";
import { toast } from "sonner";
import { runJobPunchTransition } from "@/features/work-orders/lib/jobPunchTransitionsClient";

type JobLine = Database["public"]["Tables"]["work_order_lines"]["Row"];

export default function TechJobScreen() {
  const supabase = createBrowserSupabase();
  const [jobs, setJobs] = useState<JobLine[]>([]);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchJobs = useCallback(async () => {
    setLoading(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setJobs([]);
      setLoading(false);
      return;
    }

    const { data } = await supabase
      .from("work_order_lines")
      .select("*")
      .or(`assigned_tech_id.eq.${user.id},assigned_tech_id.is.null`)
      .or("line_type.eq.job,line_type.is.null")
      .in("status", ["awaiting", "in_progress", "on_hold"])
      .order("created_at", { ascending: true });

    setJobs((data ?? []) as JobLine[]);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    void fetchJobs();

    const channel = supabase
      .channel("job-updates")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "work_order_lines" },
        () => void fetchJobs(),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchJobs, supabase]);

  const handlePunchIn = async (job: JobLine) => {
    if (!job.id) return;
    try {
      setActiveJobId(job.id);
      await runJobPunchTransition(job.id, "start");
      void fetchJobs();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to start job");
    }
  };

  const handlePunchOut = async (job: JobLine) => {
    if (!job.id) return;
    setActiveJobId(null);
    try {
      await runJobPunchTransition(job.id, "pause");
      void fetchJobs();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to pause job");
    }
  };

  const renderJobCard = (job: JobLine) => (
    <JobQueueCard
      key={job.id as string}
      job={job}
      isActive={activeJobId === job.id}
      onPunchIn={handlePunchIn}
      onPunchOut={handlePunchOut}
    />
  );

  const activeJob = jobs.find((j) => j.id === activeJobId) ?? null;
  const readyJobs = jobs.filter(
    (j) => j.status === "awaiting" && j.id !== activeJobId,
  );
  const onHoldJobs = jobs.filter((j) => j.status === "on_hold");

  return (
    <div className="space-y-6 p-4 text-white">
      <h1 className="text-xl font-blackops tracking-[0.08em] text-[var(--accent-copper-light)]">
        Technician Job Queue
      </h1>

      {loading && <p className="text-sm text-neutral-500">Loading jobs…</p>}

      {activeJob ? (
        <section className="space-y-2">
          <h2 className="text-lg font-semibold text-neutral-100">Current Job</h2>
          {renderJobCard(activeJob)}
        </section>
      ) : (
        <section className="space-y-2">
          <h2 className="text-lg font-semibold text-neutral-100">Available Jobs</h2>
          {readyJobs.length > 0 ? (
            readyJobs.map(renderJobCard)
          ) : (
            <p className="text-neutral-400">No jobs available.</p>
          )}
        </section>
      )}

      {onHoldJobs.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-lg font-semibold text-neutral-100">On Hold</h2>
          {onHoldJobs.map(renderJobCard)}
        </section>
      )}
    </div>
  );
}
