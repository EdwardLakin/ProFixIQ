// features/work-orders/components/workorders/TechJobScreen.tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";
import type { QueueJob } from "@work-orders/components/workorders/queueTypes";
import JobQueueCard from "@shared/components/JobQueueCard";

import { getQueuedJobsForTech } from "@work-orders/lib/work-orders/getQueuedJobsForTech";

export default function TechJobScreen() {
  const supabase = createClientComponentClient<Database>();
  const [jobs, setJobs] = useState<QueueJob[]>([]);
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

    // ✅ Updated to match helper signature
    const result = await getQueuedJobsForTech({ techId: user.id });
    setJobs(result);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    void fetchJobs();

    const channel = supabase
      .channel("job-updates")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "work_order_lines" },
        () => void fetchJobs()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchJobs, supabase]);

  const handlePunchIn = async (job: QueueJob) => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    setActiveJobId(job.id ?? null);

    await supabase
      .from("work_order_lines")
      .update({ status: "in_progress", assigned_to: user.id })
      .eq("id", job.id as string);

    void fetchJobs();
  };

  const handlePunchOut = async (job: QueueJob) => {
    setActiveJobId(null);

    await supabase
      .from("work_order_lines")
      .update({ status: "awaiting" })
      .eq("id", job.id as string);

    void fetchJobs();
  };

  const renderJobCard = (job: QueueJob) => (
    <JobQueueCard
      key={job.id as string}
      job={job}
      isActive={activeJobId === job.id}
      onPunchIn={handlePunchIn}
      onPunchOut={handlePunchOut}
    />
  );

  const activeJob = jobs.find((j) => j.id === activeJobId) ?? null;
  const readyJobs = jobs.filter((j) => j.status === "awaiting" && j.id !== activeJobId);
  const onHoldJobs = jobs.filter((j) => j.status === "on_hold");

  return (
    <div className="p-4 space-y-6">
      <h1 className="text-xl font-bold text-accent">Technician Job Queue</h1>

      {loading && <p className="text-sm text-neutral-500">Loading jobs…</p>}

      {activeJob ? (
        <section>
          <h2 className="text-lg font-semibold mb-2">Current Job</h2>
          {renderJobCard(activeJob)}
        </section>
      ) : (
        <section>
          <h2 className="text-lg font-semibold mb-2">Available Jobs</h2>
          {readyJobs.length > 0 ? readyJobs.map(renderJobCard) : <p>No jobs available.</p>}
        </section>
      )}

      {onHoldJobs.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold mb-2">On Hold</h2>
          {onHoldJobs.map(renderJobCard)}
        </section>
      )}
    </div>
  );
}