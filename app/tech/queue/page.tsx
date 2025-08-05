'use client';

import { useEffect, useState } from 'react';
import { getQueuedJobsForTech } from '@lib/work-orders/getQueuedJobsForTech';
import JobQueue from '@components/JobQueue';
import type { Database } from '@/types/supabase';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { useRouter } from 'next/navigation';

type JobLine = Database['public']['Tables']['work_order_lines']['Row'] & {
  vehicle?: {
    year?: number | null;
    make?: string | null;
    model?: string | null;
  };
  assigned_to?: {
    full_name?: string | null;
    id?: string | null;
  };
};

export default function TechQueuePage() {
  const supabase = createClientComponentClient<Database>();
  const [jobs, setJobs] = useState<JobLine[]>([]);
  const [loading, setLoading] = useState(true);
  const [tech, setTech] = useState<{ id: string; full_name: string | null } | null>(null);
  const router = useRouter();

  useEffect(() => {
    fetchJobsAndProfile();
  }, []);

  async function fetchJobsAndProfile() {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return;

    const { data: profile } = await supabase
      .from('profiles')
      .select('id, full_name')
      .eq('id', user.id)
      .single();

    if (profile) setTech({ id: profile.id, full_name: profile.full_name });

    const result = await getQueuedJobsForTech();
    setJobs(result);
    setLoading(false);
  }

  const handleAssignTech = async (jobId: string, techId: string) => {
    await supabase
      .from('work_order_lines')
      .update({ assigned_to: techId })
      .eq('id', jobId);
    fetchJobsAndProfile();
  };

  if (loading) return <p className="p-4 text-white">Loading jobs...</p>;

  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold mb-4 text-white">Your Assigned Jobs</h1>
      <JobQueue
        jobs={jobs}
        techOptions={tech ? [tech] : []}
        onAssignTech={handleAssignTech}
        onView={(job) => job.work_order_id && router.push(`/work-orders/view/${job.work_order_id}`)}
        filterTechId={tech?.id || null}
        title="Assigned Job Queue"
      />
    </div>
  );
}