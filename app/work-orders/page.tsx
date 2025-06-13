'use client'

import { useEffect, useState } from 'react'
import { getWorkOrderById } from '../../src/lib/db'
import WorkOrderLineEditor from '../../src/components/WorkOrderLineEditor'
import { useParams } from 'next/navigation'
import WorkOrderEditorPage from '../../src/components/WorkOrderEditorPage';

type WorkOrderLine = {
  id: string
  complaint: string
  cause?: string
  correction?: string
  labor_time?: number
  line_type?: 'diagnose' | 'repair' | 'maintenance'
  status?: 'unassigned' | 'assigned' | 'in_progress' | 'on_hold' | 'completed'
  hold_reason?: 'parts' | 'authorization' | 'diagnosis_pending' | 'other' | ''
}

export default function WorkOrderEditorPage() {
  const params = useParams()
  const workOrderId = params?.id as string

  const [workOrderLines, setWorkOrderLines] = useState<WorkOrderLine[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const fetchWorkOrder = async () => {
      const data = await getWorkOrderById(workOrderId)
      setWorkOrderLines(data?.lines || [])
      setIsLoading(false)
    }

    if (workOrderId) fetchWorkOrder()
  }, [workOrderId])

  const updateLine = (updatedLine: WorkOrderLine) => {
    const updated = workOrderLines.map((line) =>
      line.id === updatedLine.id ? updatedLine : line
    )
    setWorkOrderLines(updated)
  }

  const priorityOrder = {
    diagnose: 1,
    repair: 2,
    maintenance: 3,
  }

  const sortedLines = [...workOrderLines].sort((a, b) => {
    return (
      (priorityOrder[a.line_type || 'repair'] ?? 2) -
      (priorityOrder[b.line_type || 'repair'] ?? 2)
    )
  })

  if (isLoading) {
    return (
      <div className="text-center py-10 text-gray-600 dark:text-gray-300">
        Loading work order...
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto py-10 px-4">
      <h1 className="text-2xl font-bold mb-6 text-gray-800 dark:text-white">
        Work Order Editor
      </h1>

      {sortedLines.map((line) => (
        <div key={line.id} className="mb-6 border-b pb-4">
          <div className="flex justify-between items-center mb-2">
            <span
              className={`text-xs font-bold uppercase px-2 py-1 rounded ${
                line.line_type === 'diagnose'
                  ? 'bg-red-500 text-white'
                  : line.line_type === 'repair'
                  ? 'bg-yellow-400 text-black'
                  : 'bg-blue-500 text-white'
              }`}
            >
              {line.line_type || 'Repair'}
            </span>

            <span
              className={`text-xs px-2 py-1 rounded font-medium ${
                line.status === 'completed'
                  ? 'bg-green-600 text-white'
                  : line.status === 'on_hold'
                  ? 'bg-orange-500 text-white'
                  : line.status === 'in_progress'
                  ? 'bg-blue-500 text-white'
                  : line.status === 'assigned'
                  ? 'bg-gray-500 text-white'
                  : 'bg-neutral-300 text-black'
              }`}
            >
              {line.status?.replace('_', ' ') || 'unassigned'}
              {line.status === 'on_hold' && line.hold_reason
                ? ` – ${line.hold_reason}`
                : ''}
            </span>
          </div>

          <WorkOrderLineEditor line={line} onUpdate={updateLine} />
        </div>
      ))}
    </div>
  )
}