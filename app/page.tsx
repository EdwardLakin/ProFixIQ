'use client'

import React from 'react'
import { WorkOrderLine } from '@/types/workorders'
import { cn } from '@/lib/utils'
import { Button } from './Button'
import { formatDate } from '@/lib/date'

interface JobQueueCardProps {
  line: WorkOrderLine
  onStart: (id: string) => void
  onComplete: (id: string) => void
  onHold: (id: string, reason: 'parts' | 'authorization') => void
  isActive: boolean
  partsStatus?: 'awaiting' | 'received'
}

export const JobQueueCard: React.FC<JobQueueCardProps> = ({
  line,
  onStart,
  onComplete,
  onHold,
  isActive,
  partsStatus
}) => {
  const isOnHold = line.status === 'on_hold'
  const isComplete = line.status === 'complete'
  const isReady = line.status === 'ready'

  const holdReason = line.hold_reason

  return (
    <div
      className={cn(
        'rounded-lg p-4 shadow-md border mb-4 transition-all duration-200',
        isActive
          ? 'bg-blue-50 border-blue-500'
          : isOnHold
          ? 'bg-yellow-50 border-yellow-500'
          : isComplete
          ? 'bg-green-50 border-green-500'
          : 'bg-white border-gray-300'
      )}
    >
      <div className="flex justify-between items-center mb-2">
        <h3 className="font-bold text-lg text-gray-800">
          {line.complaint || 'Untitled Job'}
        </h3>
        <span className="text-sm text-gray-500">
          {formatDate(line.created_at)}
        </span>
      </div>

      <p className="text-sm text-gray-700 mb-2">
        <strong>Status:</strong>{' '}
        {isOnHold
          ? holdReason === 'parts'
            ? 'On Hold - Awaiting Parts'
            : 'On Hold - Awaiting Authorization'
          : isComplete
          ? 'Completed'
          : isReady
          ? 'Ready to Start'
          : 'In Progress'}
      </p>

      {partsStatus === 'awaiting' && isOnHold && holdReason === 'parts' && (
        <p className="text-sm text-orange-600 mb-2">
          Parts ordered. Awaiting arrival.
        </p>
      )}

      {partsStatus === 'received' && isOnHold && holdReason === 'parts' && (
        <p className="text-sm text-green-700 mb-2">
          All parts received. Job can now be resumed.
        </p>
      )}

      <div className="flex flex-wrap gap-2 mt-3">
        {!isComplete && !isOnHold && (
          <Button size="sm" onClick={() => onStart(line.id)}>
            Start Job
          </Button>
        )}

        {!isComplete && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => onHold(line.id, 'parts')}
          >
            Put on Hold (Parts)
          </Button>
        )}

        {!isComplete && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => onHold(line.id, 'authorization')}
          >
            Put on Hold (Authorization)
          </Button>
        )}

        {!isComplete && (
          <Button variant="success" size="sm" onClick={() => onComplete(line.id)}>
            Mark Complete
          </Button>
        )}
      </div>
    </div>
  )
}