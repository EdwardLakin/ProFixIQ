"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createBrowserClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";
import JobQueue, { QueueJob } from "@shared/components/JobQueue";

const supabase = createBrowserClient<Database>();

type Profile = Database["public"]["Tables"]["profiles"]["Row"];

export default function WorkOrderQueuePage() {
  const router = useRouter();

  const [jobs, setJobs] = useState<QueueJob[]>([]);
  const [techs, setTechs] = useState<{ id: string; full_name: string | null }[]>(
    []
  );
  const [filterTechId, setFilterTechId] = useState<string | null>(null);

  const fetchJobs = useCallback(async () => {
    const { data, error } = await supabase
      .from("work_order_lines")
      .select(
        `
        *,
        vehicles:vehicles(*),
        assigned_to:profiles(id, full_name)
      `
      )
      .order("created_at", { ascending: false })
      .returns<QueueJob[]>(); // <-- ensures TS knows this is QueueJob[]

    if (error) {
      console.error("Failed to load queue:", error);
      return;
    }
    setJobs(data ?? []);
  }, []);

  const fetchTechs = useCallback(async () => {
    // grab people who can be assigned; tweak filter to your role field if needed
    const { data, error } = await supabase
      .from("profiles")
      .select("id, full_name")
      .returns<Pick<Profile, "id" | "full_name">[]>();

    if (error) {
      console.error("Failed to load techs:", error);
      return;
    }
    setTechs(data ?? []);
  }, []);

  useEffect(() => {
    fetchJobs();
    fetchTechs();
  }, [fetchJobs, fetchTechs]);

  const handleAssignTech = async (jobId: string, techId: string) => {
    const { error } = await supabase
      .from("work_order_lines")
      .update({ assigned_to: techId })
      .eq("id", jobId);

    if (error) {
      console.error("Failed to assign tech:", error);
      return;
    }

    // optimistic UI update
    setJobs((prev) =>
      prev.map((j) =>
        j.id === jobId
          ? { ...j, assigned_to: { id: techId, full_name: techs.find(t => t.id === techId)?.full_name ?? null } }
          : j
      )
    );
  };

  const handleView = (job: QueueJob) => {
    router.push(`/work-orders/view/${job.id}`);
  };

  const jobsForUI = useMemo(() => jobs, [jobs]);

  return (
    <div className="p-6">
      <div className="mb-4">
        <label className="text-sm text-gray-300">
          Filter by technician:
          <select
            className="ml-2 bg-neutral-800 text-white border border-neutral-600 rounded px-2 py-1"
            value={filterTechId ?? ""}
            onChange={(e) => setFilterTechId(e.target.value || null)}
          >
            <option value="">All</option>
            {techs.map((t) => (
              <option key={t.id} value={t.id}>
                {t.full_name ?? "Unnamed"}
              </option>
            ))}
          </select>
        </label>
      </div>

      <JobQueue
        jobs={jobsForUI}
        techOptions={techs}
        onAssignTech={handleAssignTech}
        onView={handleView}
        filterTechId={filterTechId}
        title="Work Order Queue"
      />
    </div>
  );
}