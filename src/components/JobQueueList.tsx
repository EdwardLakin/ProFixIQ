'use client'

import React from 'react'
import { JobQueueCard } from './JobQueueCard'

type JobLine = {
  id: string
  work_order_id: string
  title: string
  status: string
  is_on_hold: boolean
  is_completed: boolean
  assigned_tech_id?: string
  hold_reason?: string
  parts_received?: boolean
}

type JobQueueListProps = {
  jobs: JobLine[]
  onStart: (id: string) => void
  onPause: (id: string) => void
  onResume: (id: string) => void
  onComplete: (id: string) => void
}

export const JobQueueList: React.FC<JobQueueListProps> = ({
  jobs,
  onStart,
  onPause,
  onResume,
  onComplete,
}) => {
  if (!jobs || jobs.length === 0) {
    return <p className="text-muted text-sm px-4 pt-6">No jobs in queue.</p>
  }

  return (
    <div className="space-y-4 px-4 py-4">
      {jobs.map((job) => (
        <JobQueueCard
          key={job.id}
          job={job}
          onStart={() => onStart(job.id)}
          onPause={() => onPause(job.id)}
          onResume={() => onResume(job.id)}
          onComplete={() => onComplete(job.id)}
        />
      ))}
    </div>
  )
}