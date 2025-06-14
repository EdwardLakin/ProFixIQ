'use client'

import React, { useState } from 'react'
import VehicleSelector from '../../../components/VehicleSelector'
import DTCCodeLookup from '../../../components/DTCCodeLookup'
import { useVehicleInfo } from '../../../hooks/useVehicleInfo'

export default function DTCPage() {
  const { vehicle } = useVehicleInfo()
  const [code, setCode] = useState('')
  const [result, setResult] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const handleLookup = async () => {
    if (!code || !vehicle?.year || !vehicle?.make || !vehicle?.model) {
      alert('Please enter a DTC code and select a vehicle.')
      return
    }

    setLoading(true)
    setResult(null)

    try {
      const res = await fetch('/api/diagnose', {
        method: 'POST',
        body: JSON.stringify({ code, vehicle }),
      })

      if (!res.ok) throw new Error('Failed to fetch DTC info')
      const data = await res.json()
      setResult(data.result)
    } catch (err) {
      console.error('DTC Lookup Error:', err)
      setResult('❌ Failed to fetch DTC info. Try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="p-4">
      <VehicleSelector />

      <h1 className="text-xl font-bold mt-4">🔍 DTC Lookup</h1>

      <div className="mt-2">
        <input
          type="text"
          placeholder="Enter a DTC code (e.g., P0131)"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          className="p-2 border rounded mr-2"
        />
        <button
          onClick={handleLookup}
          disabled={loading || !code}
          className="bg-accent text-white px-3 py-2 rounded"
        >
          {loading ? 'Searching...' : 'Search'}
        </button>
      </div>

      {result && (
        <div className="mt-6">
          <h2 className="text-lg font-semibold mb-2">AI Diagnosis</h2>
          <pre className="whitespace-pre-wrap text-sm bg-muted p-2 rounded shadow">
            {result}
          </pre>
        </div>
      )}
    </div>
  )
}