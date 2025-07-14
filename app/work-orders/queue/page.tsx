'use client';

import { useEffect, useState } from 'react';
import { getQueuedJobsForTech } from '@lib/tech/getQueuedJobsForTech';
import type { JobLine } from '@lib/types';
import JobQueueCard from '@components/JobQueueCard';
import Link from 'next/link';

const STATUSES: JobLine['status'][] = ['awaiting', 'in_progress', 'on_hold', 'completed'];

export default function JobQueuePage() {
  const [jobs, setJobs] = useState<JobLine[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeStatus, setActiveStatus] = useState<JobLine['status']>('awaiting');

  useEffect(() => {
    const fetchJobs = async () => {
      setLoading(true);
      const rawData = await getQueuedJobsForTech();

      const mapped = (rawData || []).map((job): JobLine => ({
        id: job.id,
        status: mapStatus(job.status),
        complaint: job.complaint ?? null,
        vehicle: {
          year: job.vehicle?.year ?? undefined,
          make: job.vehicle?.make ?? '',
          model: job.vehicle?.model ?? '',
        },
        assigned_to: {
          full_name: job.assigned_to?.full_name ?? '',
        },
        punched_in_at: job.punched_in_at ?? null,
        punched_out_at: job.punched_out_at ?? null,
        hold_reason: job.hold_reason ?? null,
        created_at: job.created_at ?? '',
      }));

      setJobs(mapped);
      setLoading(false);
    };

    fetchJobs();
  }, []);

  const filteredJobs = jobs.filter((job) => job.status === activeStatus);

  return (
    <div className="p-6">
      <div className="flex space-x-2 mb-4">
        {STATUSES.map((status) => (
          <button
            key={status}
            onClick={() => setActiveStatus(status)}
            className={`px-3 py-1 rounded-full text-sm font-semibold ${
              activeStatus === status
                ? 'bg-orange-500 text-white border-orange-500'
                : 'bg-white text-black border-gray-300 dark:bg-gray-800 dark:text-white dark:border-gray-600'
            } border`}
          >
            {status.replaceAll('_', ' ')}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-muted">Loading jobs...</p>
      ) : filteredJobs.length === 0 ? (
        <p className="text-muted">
          No {activeStatus.replaceAll('_', ' ')} jobs.
        </p>
      ) : (
        <div className="space-y-4">
          {filteredJobs.map((job) => (
            <Link href={`/work-orders/${job.id}`} key={job.id} className="block hover:shadow-md transition">
              <JobQueueCard job={job} />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function mapStatus(input: string): JobLine['status'] {
  const normalized = input.toLowerCase();
  if (['awaiting', 'in_progress', 'on_hold', 'completed'].includes(normalized)) {
    return normalized as JobLine['status'];
  }
  return 'awaiting'; // fallback
}