'use client';

import React from 'react';
import JobQueueCard from './JobQueueCard';
import { ScrollArea } from './ui/scroll-area';
import { Section } from './ui/section';

export type JobStatus =
  | 'in_progress'
  | 'on_hold'
  | 'awaiting_parts'
  | 'parts_ordered'
  | 'authorized'
  | 'completed';

export interface JobLine {
  id: string;
  vehicle: string;
  complaint: string;
  tech?: string;
  status: JobStatus;
  hold_reason?: string;
  isNext?: boolean;
  isReady?: boolean;
  updated_at?: string;
}

interface JobQueueProps {
  jobs: JobLine[];
  title?: string;
  onStartJob: (jobId: string) => void;
}

const JobQueue: React.FC<JobQueueProps> = ({ jobs, title = 'Job Queue', onStartJob }) => {
  return (
    <Section title={title}>
      <ScrollArea className="h-[80vh]">
        <div className="space-y-4">
          {jobs.length === 0 ? (
            <p className="text-sm text-gray-500 italic text-center py-8">No jobs available.</p>
          ) : (
            jobs.map((job) => (
              <JobQueueCard key={job.id} job={job} onStart={() => onStartJob(job.id)} />
            ))
          )}
        </div>
      </ScrollArea>
    </Section>
  );
};

export default JobQueue;