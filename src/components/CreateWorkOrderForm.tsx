'use client'

import { useState } from 'react'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

type Props = {
  userId: string
  onCreated: (workOrderId: string) => void
}

export default function CreateWorkOrderForm({ userId, onCreated }: Props) {
  const [vehicleId, setVehicleId] = useState('')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState<string | null>(null)

  const handleCreate = async () => {
    if (!vehicleId) return setError('Vehicle ID is required.')

    const { data, error } = await supabase
      .from('work_orders')
      .insert([
        {
          user_id: userId,
          vehicle_id: vehicleId,
          notes,
          status: 'new',
        },
      ])
      .select()
      .single()

    if (error) {
      console.error(error)
      setError(error.message)
    } else {
      onCreated(data.id)
    }
  }

  return (
    <div className="max-w-xl mx-auto p-4 bg-surface border border-muted rounded space-y-4">
      <h2 className="text-lg font-semibold">Create New Work Order</h2>

      <input
        type="text"
        placeholder="Vehicle ID"
        value={vehicleId}
        onChange={(e) => setVehicleId(e.target.value)}
        className="w-full p-2 border border-muted rounded bg-background"
      />

      <textarea
        placeholder="Optional notes"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        className="w-full p-2 border border-muted rounded bg-background"
        rows={3}
      />

      <button
        onClick={handleCreate}
        className="px-6 py-2 bg-primary text-white rounded hover:bg-primary-dark"
      >
        Create Work Order
      </button>

      {error && <p className="text-red-500">{error}</p>}
    </div>
  )
}