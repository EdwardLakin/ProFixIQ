// features/work-orders/components/workorders/TechJobScreen.tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import { createBrowserSupabase } from "@/features/shared/lib/supabase/client";
import type { Database } from "@shared/types/types/supabase";
import JobQueueCard from "@shared/components/JobQueueCard";
import { toast } from "sonner";
import { runJobPunchTransition } from "@/features/work-orders/lib/jobPunchTransitionsClient";
import { WORKSPACE_CAPABILITIES } from "@/features/workspace/authorization/capabilities";
import { useWorkspaceCapabilities } from "@/features/workspace/authorization/useWorkspaceCapabilities";

type JobLine = Database["public"]["Tables"]["work_order_lines"]["Row"];

export default function TechJobScreen() {
  const supabase = createBrowserSupabase();
  const { can } = useWorkspaceCapabilities();
  const canExecuteJob = can(
    WORKSPACE_CAPABILITIES.executeAssignedWorkOrderJobs,
  );
  const [jobs, setJobs] = useState<JobLine[]>([]);
  const [executableLineIds, setExecutableLineIds] = useState<Set<string>>(
    () => new Set(),
  );
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

    const response = await fetch(
      "/api/work-order-lines/operational?limit=500",
      {
        cache: "no-store",
      },
    );
    const body = (await response.json().catch(() => null)) as {
      lines?: JobLine[];
      executableLineIds?: string[];
    } | null;
    const jobs = (body?.lines ?? [])
      .filter(
        (line) =>
          line.line_type === "job" &&
          ["awaiting", "in_progress", "on_hold"].includes(line.status),
      )
      .sort(
        (left, right) =>
          new Date(left.created_at ?? 0).getTime() -
          new Date(right.created_at ?? 0).getTime(),
      );
    setJobs(response.ok ? jobs : []);
    setExecutableLineIds(
      response.ok ? new Set(body?.executableLineIds ?? []) : new Set(),
    );
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
    if (!job.id || !canExecuteJob) return;
    try {
      setActiveJobId(job.id);
      await runJobPunchTransition(job.id, "start");
      void fetchJobs();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to start job",
      );
    }
  };

  const handlePunchOut = async (job: JobLine) => {
    if (!job.id || !canExecuteJob) return;
    setActiveJobId(null);
    try {
      await runJobPunchTransition(job.id, "pause");
      void fetchJobs();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to pause job",
      );
    }
  };

  const renderJobCard = (job: JobLine) => (
    <JobQueueCard
      key={job.id as string}
      job={job}
      isActive={activeJobId === job.id}
      onPunchIn={
        canExecuteJob && executableLineIds.has(job.id)
          ? handlePunchIn
          : undefined
      }
      onPunchOut={
        canExecuteJob && executableLineIds.has(job.id)
          ? handlePunchOut
          : undefined
      }
    />
  );

  const activeJob = jobs.find((j) => j.id === activeJobId) ?? null;
  const readyJobs = jobs.filter(
    (j) => j.status === "awaiting" && j.id !== activeJobId,
  );
  const onHoldJobs = jobs.filter((j) => j.status === "on_hold");

  return (
    <div className="space-y-6 p-4 text-[color:var(--theme-text-primary)]">
      <h1 className="text-xl font-blackops tracking-[0.08em] text-[var(--accent-copper-light)]">
        Technician Job Queue
      </h1>

      {loading && (
        <p className="text-sm text-[color:var(--theme-text-muted)]">
          Loading jobs…
        </p>
      )}

      {activeJob ? (
        <section className="space-y-2">
          <h2 className="text-lg font-semibold text-[color:var(--theme-text-primary)]">
            Current Job
          </h2>
          {renderJobCard(activeJob)}
        </section>
      ) : (
        <section className="space-y-2">
          <h2 className="text-lg font-semibold text-[color:var(--theme-text-primary)]">
            Available Jobs
          </h2>
          {readyJobs.length > 0 ? (
            readyJobs.map(renderJobCard)
          ) : (
            <p className="text-[color:var(--theme-text-secondary)]">
              No jobs available.
            </p>
          )}
        </section>
      )}

      {onHoldJobs.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-lg font-semibold text-[color:var(--theme-text-primary)]">
            On Hold
          </h2>
          {onHoldJobs.map(renderJobCard)}
        </section>
      )}
    </div>
  );
}
