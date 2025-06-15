'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import { generateCorrectionStory } from '@lib/generateCorrectionStoryFromInspection'
import { saveWorkOrderLines } from '@lib/saveWorkOrderLines'
import { RepairLine } from '@lib/parseRepairOutput'
import WorkOrderEditorPage from '@components/WorkOrderEditorPage'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

type Props = {
  inspectionId: string
  userId: string
  vehicleId: string
}

export default function AutoCreateWorkOrderFromInspection({
  inspectionId,
  userId,
  vehicleId,
}: Props) {
  const [workOrderId, setWorkOrderId] = useState<string | null>(null)
  const [lines, setLines] = useState<RepairLine[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const run = async () => {
      try {
        const { data: items, error: fetchError } = await supabase
          .from('inspection_items')
          .select('*')
          .eq('inspection_id', inspectionId)

        if (fetchError || !items || items.length === 0) {
          throw new Error('Could not load inspection items.')
        }

        const summary = generateCorrectionStory(items)

        const { data: newOrder, error: orderError } = await supabase
          .from('work_orders')
          .insert([
            {
              user_id: userId,
              vehicle_id: vehicleId,
              status: 'generated',
              summary: summary,
            },
          ])
          .select()
          .single()

        if (orderError || !newOrder) {
          throw new Error('Failed to create work order.')
        }

        const newWorkOrderId = newOrder.id
        setWorkOrderId(newWorkOrderId)

        const parsedLines: RepairLine[] = items.map((item) => ({
          complaint: `${item.category}: ${item.item}`,
          cause: item.notes || '',
          correction: item.status === 'fail' ? 'Repair or replace as required' : '',
          tools: [],
          labor_time: '',
        }))

        parsedLines.push({
          complaint: 'General Repair Summary',
          correction: summary,
        })

        await saveWorkOrderLines(parsedLines, userId, vehicleId, newWorkOrderId)

        setLines(parsedLines)
      } catch (err: any) {
        console.error(err)
        setError(err.message || 'Unexpected error')
      }
    }

    run()
  }, [inspectionId, userId, vehicleId])

  if (error) {
    return <p className="p-4 text-red-500">❌ {error}</p>
  }

  if (!workOrderId || !lines) {
    return <p className="p-4 text-accent">Creating work order from inspection...</p>
  }

  // ✅ Show editor after creation
  return (
    <WorkOrderEditorPage
      rawOutput={''} // not used anymore, passed lines directly
      userId={userId}
      vehicleId={vehicleId}
      workOrderId={workOrderId}
      initialLines={lines}
    />
  )
}