'use client';

import { useEffect, useState } from 'react';
import { getQueuedJobsForTech } from '@lib/work-orders/getQueuedJobsForTech';
import type { JobLine, JobStatus } from '@lib/types';
import JobQueueCard from '@components/JobQueueCard';
import Link from 'next/link';

const STATUSES: JobStatus[] = ['awaiting', 'in_progress', 'on_hold', 'completed'];

export default function JobQueuePage() {
  const [jobs, setJobs] = useState<JobLine[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeStatus, setActiveStatus] = useState<JobStatus>('awaiting');

  useEffect(() => {
    const fetchJobs = async () => {
      setLoading(true);
      const data = await getQueuedJobsForTech();
      setJobs(data || []);
      setLoading(false);
    };

    fetchJobs();
  }, []);

  const filteredJobs = jobs.filter((job) => job.status === activeStatus);

  return (
    <div className="p-6">
      <h1 className="text-2xl font-black mb-4">Job Queue</h1>

      <div className="flex space-x-2 mb-4">
        {STATUSES.map((status) => (
          <button
            key={status}
            onClick={() => setActiveStatus(status)}
            className={`px-3 py-1 rounded-full text-sm font-semibold border ${
              activeStatus === status
                ? 'bg-orange-500 text-white border-orange-500'
                : 'bg-white text-black border-gray-300 dark:bg-gray-800 dark:text-white dark:border-gray-600'
            }`}
          >
            {status.replace('_', ' ')}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-muted">Loading jobs...</p>
      ) : filteredJobs.length === 0 ? (
        <p className="text-muted">
          No {activeStatus.replace('_', ' ')} jobs.
        </p>
      ) : (
        <div className="space-y-4">
          {filteredJobs.map((job) => (
            <Link
              key={job.id}
              href={`/work-orders/${job.id}`}
              className="block hover:shadow-md transition"
            >
              <JobQueueCard job={job} />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}