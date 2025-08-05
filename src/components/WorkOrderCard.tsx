'use client';

import { format } from 'date-fns';
import Link from 'next/link';
import type { Database } from '@/types/supabase';

type WorkOrderLine = Database['public']['Tables']['work_order_lines']['Row'] & {
  vehicle?: {
    year?: number | null;
    make?: string | null;
    model?: string | null;
  };
  assigned_to?: {
    full_name?: string | null;
  };
};

const statusStyles: Record<string, { tag: string; bar: string }> = {
  awaiting: {
    tag: 'bg-blue-100 text-blue-800',
    bar: 'bg-blue-500',
  },
  in_progress: {
    tag: 'bg-orange-100 text-orange-800',
    bar: 'bg-orange-500',
  },
  on_hold: {
    tag: 'bg-yellow-100 text-yellow-800',
    bar: 'bg-yellow-500',
  },
  completed: {
    tag: 'bg-green-100 text-green-800',
    bar: 'bg-green-500',
  },
};

interface WorkOrderCardProps {
  job: WorkOrderLine;
}

export default function WorkOrderCard({ job }: WorkOrderCardProps) {
  const {
    status,
    created_at,
    vehicle,
    assigned_to,
    complaint,
    work_order_id,
  } = job;

  const vehicleInfo = [vehicle?.year, vehicle?.make, vehicle?.model]
    .filter(Boolean)
    .join(' ') || 'Unknown vehicle';

  const styles = statusStyles[status] ?? {
    tag: 'bg-gray-100 text-gray-800',
    bar: 'bg-gray-400',
  };

  return (
    <Link href={`/work-orders/view/${work_order_id}`} className="block">
      <div className="flex border rounded overflow-hidden shadow-sm mb-3 bg-white dark:bg-gray-900 hover:shadow-md transition-shadow duration-200">
        <div className={`w-1 ${styles.bar}`} />
        <div className="flex-1 p-4">
          <div className="flex justify-between items-center mb-2">
            <span className={`text-xs font-medium px-2 py-1 rounded ${styles.tag}`}>
              {status.replace('_', ' ')}
            </span>
            <span className="text-xs text-gray-500 dark:text-gray-400">
              {created_at ? format(new Date(created_at), 'PPp') : '—'}
            </span>
          </div>
          <p className="text-sm font-semibold">{vehicleInfo}</p>
          <p className="text-sm text-gray-700 dark:text-gray-300">
            Complaint: {complaint || 'N/A'}
          </p>
          <p className="text-sm text-gray-700 dark:text-gray-300">
            Assigned: {assigned_to?.full_name || 'Unassigned'}
          </p>
        </div>
      </div>
    </Link>
  );
}