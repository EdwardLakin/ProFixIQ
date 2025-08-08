"use client";

import React, { useEffect, useState, useCallback } from "react";
import { useUser } from "@auth/hooks/useUser";
import { createBrowserSupabase } from "@shared/lib/supabase/client";
import type { Database } from "@shared/types/types/supabase";
import JobQueueCard from "@shared/components/JobQueueCard";
import { Button } from "@shared/components/ui/Button";

// Supabase typed row
type JobLine = Database["public"]["Tables"]["work_order_lines"]["Row"] & {
  vehicle?: { year?: number | null; make?: string | null; model?: string | null };
  assigned_to_profile?: { full_name?: string | null }; // if you join a profile, optional
};

const supabase = createBrowserSupabase();

export default function TechJobScreen() {
  const { user } = useUser();
  const [jobLines, setJobLines] = useState<JobLine[]>([]);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchJobs = useCallback(async () => {
    if (!user) return;
    setLoading(true);

    // Pull jobs assigned to the current tech or unassigned, in relevant statuses
    const { data, error } = await supabase
      .from("work_order_lines")
      .select(
        // keep it simple; add relationships if you have FKs/views for them
        "*"
      )
      .or(`assigned_to.eq.${user.id},assigned_to.is.null`)
      .in("status", ["awaiting", "in_progress", "on_hold"])
      .order("created_at", { ascending: true });

    if (!error && data) {
      setJobLines(data as JobLine[]);
    }

    setLoading(false);
  }, [user]);

  useEffect(() => {
    if (!user) return;

    fetchJobs();

    // realtime updates
    const channel = supabase
      .channel("job-updates")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "work_order_lines" },
        fetchJobs
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, fetchJobs]);

  const handlePunchIn = async (job: JobLine) => {
    if (!user) return;
    setActiveJobId(job.id ?? null);

    await supabase
      .from("work_order_lines")
      .update({ status: "in_progress", assigned_to: user.id })
      .eq("id", job.id as string);

    fetchJobs();
  };

  const handlePunchOut = async (job: JobLine) => {
    setActiveJobId(null);

    await supabase
      .from("work_order_lines")
      .update({ status: "awaiting" })
      .eq("id", job.id as string);

    fetchJobs();
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

  const activeJob = jobLines.find((j) => j.id === activeJobId) ?? null;
  const readyJobs = jobLines.filter(
    (j) => j.status === "awaiting" && j.id !== activeJobId
  );
  const onHoldJobs = jobLines.filter((j) => j.status === "on_hold");

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

      <div className="pt-6">
        <Button onClick={() => supabase.auth.signOut()}>Sign Out</Button>
      </div>
    </div>
  );
}