// app/queue/page.tsx
'use client';

import { useEffect, useState } from 'react';
import { getQueuedJobsForTech } from '@lib/work-orders/getQueuedJobsForTech';
import type { Database } from 'types/supabase';

type WorkOrderLine = Database['public']['Tables']['work_order_lines']['Row'];

export default function TechQueuePage() {
  const [jobs, setJobs] = useState<WorkOrderLine[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchJobs() {
      const result = await getQueuedJobsForTech();
      setJobs(result);
      setLoading(false);
    }

    fetchJobs();
  }, []);

  if (loading) return <p className="p-4">Loading jobs...</p>;

  if (jobs.length === 0) return <p className="p-4">No jobs assigned to you.</p>;

  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold mb-4">Your Assigned Jobs</h1>
      <div className="space-y-4">
        {jobs.map((job) => (
          <div
            key={job.id}
            className="border rounded-lg p-4 bg-white dark:bg-black shadow-sm"
          >
            <div className="text-sm text-gray-500 mb-1">
              Status: <span className="font-semibold">{job.status}</span>
            </div>
            <div className="text-lg font-semibold">
              {job.vehicles?.year} {job.vehicles?.make} {job.vehicles?.model}
            </div>
            {job.complaint && (
              <p className="text-sm mt-1">
                <span className="font-semibold">Complaint:</span> {job.complaint}
              </p>
            )}
            <p className="text-xs text-gray-400 mt-2">
              Job ID: {job.id}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}