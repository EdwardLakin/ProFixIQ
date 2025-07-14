'use client';

import { useEffect, useState } from 'react';
import JobQueueCard from '@components/JobQueueCard';
import { JobLine } from '@lib/types';
import { getQueuedJobsForTech } from '@lib/work-orders/fetchJobs';
import { handleWorkOrderCommand } from '@lib/work-orders/handleWorkOrderCommand';

export default function JobQueuePage() {
  const [jobs, setJobs] = useState<JobLine[]>([]);
  const [loading, setLoading] = useState(true);
  const [input, setInput] = useState('');
  const [feedback, setFeedback] = useState('');

  const fetchJobs = async () => {
    setLoading(true);
    const jobList = await getQueuedJobsForTech();
    setJobs(jobList || []);
    setLoading(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;

    const response = await handleWorkOrderCommand(input.trim());
    setFeedback(response);
    setInput('');
    fetchJobs(); // Refresh UI after command
  };

  useEffect(() => {
    fetchJobs();
  }, []);

  return (
    <div className="min-h-screen bg-surface p-6 text-white">
      <h1 className="text-accent text-2xl font-bold mb-6">🧰 Technician Job Queue</h1>

      <form onSubmit={handleSubmit} className="mb-4 flex gap-2">
        <input
          type="text"
          placeholder="Enter command (e.g., 'Start job 123')"
          value={input}
          onChange={e => setInput(e.target.value)}
          className="flex-1 px-4 py-2 rounded border border-white bg-black"
        />
        <button type="submit" className="px-4 py-2 bg-orange-500 rounded font-blackops">
          Submit
        </button>
      </form>

      {feedback && <p className="mb-4 text-sm text-green-400">{feedback}</p>}

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