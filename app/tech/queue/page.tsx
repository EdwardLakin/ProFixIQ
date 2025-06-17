'use client';

import { useEffect, useState } from 'react';
import { getQueuedJobsForTech } from '@/lib/tech';
import JobQueueCard from '@/components/JobQueueCard';
import { JobLine } from '@/types';

export default function JobQueuePage() {
  const [jobs, setJobs] = useState<JobLine[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchJobs = async () => {
      setLoading(true);
      const jobList = await getQueuedJobsForTech();
      setJobs(jobList || []);
      setLoading(false);
    };

    fetchJobs();
  }, []);

  return (
    <div className="min-h-screen bg-surface p-4">
      <h1 className="text-accent text-2xl font-bold mb-6">🧰 Technician Job Queue</h1>

      {loading ? (
        <p className="text-muted">Loading jobs...</p>
      ) : jobs.length === 0 ? (
        <p className="text-muted">No jobs in your queue.</p>
      ) : (
        <div className="space-y-4">
          {jobs.map((job) => (
            <JobQueueCard key={job.id} job={job} />
          ))}
        </div>
      )}
    </div>
  );
}