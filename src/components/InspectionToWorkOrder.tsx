'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import { generateCorrectionStory } from '../lib/generateCorrectionStoryFromInspection'
import { saveWorkOrderLines } from '../lib/saveWorkOrderLines'
import WorkOrderLineEditor from './WorkOrderLineEditor'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

type InspectionItem = {
  section: string
  item: string
  status: string
  value?: string
  notes?: string
}

type Props = {
  inspectionId: string
  userId: string
  vehicleId: string
  workOrderId: string
}

export default function InspectionToWorkOrder({ inspectionId, userId, vehicleId, workOrderId }: Props) {
  const [lines, setLines] = useState<any[]>([])
  const [loaded, setLoaded] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    const fetchInspection = async () => {
      const { data, error } = await supabase
        .from('inspection_items')
        .select('*')
        .eq('inspection_id', inspectionId)

      if (error || !data) return console.error('Error loading inspection', error)

      const parsed = data.map((item: InspectionItem) => ({
        complaint: `${item.section}: ${item.item}`,
        cause: item.notes || '',
        correction: item.status === 'fail' ? 'Repair or replace as required' : '',
        tools: [],
        labor_time: '',
      }))

      const summary = generateCorrectionStory(data)
      parsed.push({
        complaint: 'General repair summary',
        correction: summary,
      })

      setLines(parsed)
      setLoaded(true)
    }

    fetchInspection()
  }, [inspectionId])

  const handleSave = async () => {
    await saveWorkOrderLines(lines, userId, vehicleId, workOrderId)
    setSaved(true)
  }

  if (!loaded) return <p className="p-4 text-accent">Loading inspection...</p>

  return (
    <div className="space-y-6 max-w-3xl mx-auto p-6 bg-surface rounded shadow-card">
      <h2 className="text-xl font-semibold">Create Work Order from Inspection</h2>

      <WorkOrderLineEditor lines={lines} onChange={setLines} />

      <button
        onClick={handleSave}
        className="px-6 py-2 bg-primary text-white rounded hover:bg-primary-dark"
      >
        Save Work Order
      </button>

      {saved && <p className="text-green-500">✅ Work order saved</p>}
    </div>
  )
}