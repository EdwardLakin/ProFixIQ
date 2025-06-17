import { format } from 'date-fns'

interface JobQueueCardProps {
  job: {
    id: string
    status: 'awaiting' | 'in_progress' | 'on_hold' | 'completed'
    complaint?: string
    vehicle?: {
      year?: number
      make?: string
      model?: string
    }
    assigned_tech?: {
      full_name?: string
    }
    punched_in_at?: string | null
    punched_out_at?: string | null
    hold_reason?: string | null
  }
}

export default function JobQueueCard({ job }: JobQueueCardProps) {
  const { vehicle, complaint, assigned_tech, status, punched_in_at, punched_out_at, hold_reason } = job

  const statusColor = {
    awaiting: 'bg-blue-100 text-blue-800',
    in_progress: 'bg-orange-100 text-orange-800',
    on_hold: 'bg-yellow-100 text-yellow-800',
    completed: 'bg-green-100 text-green-800',
  }[status]

  return (
    <div className="rounded-lg border border-border bg-white dark:bg-surface p-4 shadow-card">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-2">
        <div>
          <p className="text-accent font-medium text-lg">
            {vehicle?.year} {vehicle?.make} {vehicle?.model}
          </p>
          <p className="text-sm text-muted">
            Complaint: <span className="text-foreground">{complaint || '—'}</span>
          </p>
          <p className="text-sm text-muted">
            Technician: <span className="text-foreground">{assigned_tech?.full_name || 'Unassigned'}</span>
          </p>
        </div>

        <span className={`px-3 py-1 rounded-full text-sm font-semibold ${statusColor} capitalize`}>
          {status.replaceAll('_', ' ')}
        </span>
      </div>

      {punched_in_at && (
        <p className="text-sm text-muted">
          Punched In: {format(new Date(punched_in_at), 'PPpp')}
        </p>
      )}

      {punched_out_at && (
        <p className="text-sm text-muted">
          Punched Out: {format(new Date(punched_out_at), 'PPpp')}
        </p>
      )}

      {status === 'on_hold' && hold_reason && (
        <p className="text-sm text-yellow-700 mt-1">
          Hold Reason: <span className="font-medium">{hold_reason}</span>
        </p>
      )}
    </div>
  )
}