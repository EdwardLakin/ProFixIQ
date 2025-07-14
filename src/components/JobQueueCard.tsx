import { format } from 'date-fns';

interface JobQueueCardProps {
  job: {
    id: string;
    status: 'awaiting' | 'in_progress' | 'on_hold' | 'completed';
    complaint: string | null;
    vehicle?: {
      year?: number;
      make?: string;
      model?: string;
    };
    assigned_to?: {
      full_name?: string;
    } | null;
    punched_in_at?: string | null;
    punched_out_at?: string | null;
    hold_reason?: string | null;
    created_at?: string;
  };
}

const statusColor = {
  awaiting: 'bg-blue-100 text-blue-800',
  in_progress: 'bg-orange-100 text-orange-800',
  on_hold: 'bg-yellow-100 text-yellow-800',
  completed: 'bg-green-100 text-green-800',
};

export default function JobQueueCard({ job }: JobQueueCardProps) {
  const {
    complaint,
    vehicle,
    assigned_to,
    status,
    punched_in_at,
    punched_out_at,
    hold_reason,
    created_at,
  } = job;

  return (
    <div className="border rounded p-4 shadow-sm mb-3 bg-white dark:bg-gray-900">
      <div className="flex justify-between items-center mb-2">
        <span className={`text-xs font-medium px-2 py-1 rounded ${statusColor[status]}`}>
          {status.replace('_', ' ')}
        </span>
        <span className="text-xs text-gray-500 dark:text-gray-400">
          {created_at ? format(new Date(created_at), 'PPp') : '—'}
        </span>
      </div>

      <p className="text-sm mb-1 font-semibold">
        {vehicle?.year} {vehicle?.make} {vehicle?.model}
      </p>
      <p className="text-sm text-gray-700 dark:text-gray-300">
        Complaint: {complaint || 'N/A'}
      </p>
      <p className="text-sm text-gray-700 dark:text-gray-300">
        Assigned: {assigned_to?.full_name || 'Unassigned'}
      </p>
      {punched_in_at && (
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Punched In: {format(new Date(punched_in_at), 'p')}
        </p>
      )}
      {punched_out_at && (
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Punched Out: {format(new Date(punched_out_at), 'p')}
        </p>
      )}
      {hold_reason && (
        <p className="text-sm text-yellow-700 dark:text-yellow-400">
          On Hold Reason: {hold_reason}
        </p>
      )}
    </div>
  );
}