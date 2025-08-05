'use client';

import { memo, useState } from 'react';
import { format } from 'date-fns';
import type { Database } from '@/types/supabase';

// ✅ Job type from Supabase, extended with assigned_to shape
type JobLine = Database['public']['Tables']['work_order_lines']['Row'] & {
  assigned_to?: {
    id: string | null;
    full_name?: string | null;
  };
};

interface JobQueueCardProps {
  job: JobLine;
  techOptions: { id: string; full_name: string | null }[];
  onAssignTech: (jobId: string, techId: string) => void;
  onView: (job: JobLine) => void;
  isActive?: boolean;
}

function JobQueueCard({
  job,
  techOptions,
  onAssignTech,
  onView,
  isActive,
}: JobQueueCardProps) {
  const { complaint, created_at, status, assigned_to, id } = job;

  const [selectedTech, setSelectedTech] = useState<string | null>(assigned_to?.id || null);

  const handleAssign = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const techId = e.target.value;
    setSelectedTech(techId);
    onAssignTech(id, techId);
  };

  return (
    <div
      className={`border rounded shadow-sm bg-white dark:bg-gray-900 hover:shadow-md transition-shadow ${
        isActive ? 'ring-2 ring-orange-400' : ''
      }`}
    >
      <div className="flex justify-between items-center p-4">
        <div>
          <p className="text-sm font-semibold text-black dark:text-white">
            Complaint: {complaint || 'N/A'}
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {created_at ? format(new Date(created_at), 'PPp') : '—'}
          </p>
        </div>
        <div className="text-sm">
          <select
            value={selectedTech ?? ''}
            onChange={handleAssign}
            className="text-sm px-2 py-1 border rounded bg-white dark:bg-gray-800 dark:text-white"
          >
            <option value="">Unassigned</option>
            {techOptions.map((tech) => (
              <option key={tech.id} value={tech.id}>
                {tech.full_name}
              </option>
            ))}
          </select>
        </div>
      </div>
      <button
        onClick={() => onView(job)}
        className="block w-full text-left px-4 pb-4 text-blue-600 hover:underline text-sm"
      >
        View Work Order
      </button>
    </div>
  );
}

export default memo(JobQueueCard);