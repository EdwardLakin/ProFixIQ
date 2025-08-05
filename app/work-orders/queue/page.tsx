'use client';

import { useEffect, useState } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { useRouter } from 'next/navigation';
import { Database } from '@/types/supabase';
import JobQueue from '@components/JobQueue';

type JobLine = Database['public']['Tables']['work_order_lines']['Row'] & {
  vehicle?: {
    year?: number | null;
    make?: string | null;
    model?: string | null;
  };
  assigned_to?: {
    id?: string | null;
    full_name?: string | null;
  };
};

type Tech = {
  id: string;
  full_name: string | null;
};

export default function WorkOrderQueuePage() {
  const supabase = createClientComponentClient<Database>();
  const router = useRouter();

  const [jobs, setJobs] = useState<JobLine[]>([]);
  const [techs, setTechs] = useState<Tech[]>([]);
  const [filterTech, setFilterTech] = useState<string>('');

  useEffect(() => {
    const fetchData = async () => {
      const { data: jobLines } = await supabase
        .from('work_order_lines')
        .select(`
          *,
          vehicles (
            year,
            make,
            model
          ),
          assigned_to:profiles (
            id,
            full_name
          )
        `)
        .order('created_at', { ascending: false });

      const { data: techProfiles } = await supabase
        .from('profiles')
        .select('id, full_name')
        .in('role', ['mechanic', 'technician']);

      if (jobLines) setJobs(jobLines as JobLine[]);
      if (techProfiles) setTechs(techProfiles);
    };

    fetchData();
  }, [supabase]);

  const getTechById = (id: string) =>
    techs.find((t) => t.id === id) ?? { id, full_name: null };

  const handleAssignTech = async (jobId: string, techId: string) => {
    await supabase
      .from('work_order_lines')
      .update({ assigned_to: techId })
      .eq('id', jobId);

    const tech = getTechById(techId);

    setJobs((prev) =>
      prev.map((job) =>
        job.id === jobId
          ? ({
              ...job,
              assigned_to: {
                id: techId,
                full_name: tech.full_name,
              },
            } as JobLine)
          : job
      )
    );
  };

  const handleView = (job: JobLine) => {
    if (job.work_order_id) {
      router.push(`/work-orders/view/${job.work_order_id}`);
    }
  };

  return (
    <div className="p-4 max-w-5xl mx-auto space-y-4">
      <h1 className="text-2xl font-bold text-white">Work Order Queue</h1>

      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
        <label className="text-white text-sm">
          Filter by Technician:
          <select
            value={filterTech}
            onChange={(e) => setFilterTech(e.target.value)}
            className="ml-2 bg-zinc-900 text-white border border-zinc-700 rounded px-2 py-1"
          >
            <option value="">All</option>
            {techs.map((tech) => (
              <option key={tech.id} value={tech.id}>
                {tech.full_name || 'Unnamed'}
              </option>
            ))}
          </select>
        </label>
      </div>

      <JobQueue
        jobs={jobs}
        techOptions={techs}
        onAssignTech={handleAssignTech}
        onView={handleView}
        filterTechId={filterTech}
      />
    </div>
  );
}