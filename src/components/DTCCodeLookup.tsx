'use client'

import { useState } from 'react'
import { diagnoseDTC } from '../lib/dtc'
import LoadingOverlay from './LoadingOverlay'

export default function DTCCodeLookup() {
  const [vehicle, setVehicle] = useState('')
  const [dtcCode, setDtcCode] = useState('')
  const [response, setResponse] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  const handleSubmit = async () => {
    if (!vehicle || !dtcCode) return
    setIsLoading(true)
    try {
      const result = await diagnoseDTC(vehicle, dtcCode)
      setResponse(result.answer || JSON.stringify(result, null, 2))
    } catch (err) {
      setResponse('Error diagnosing code.')
      console.error(err)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="max-w-2xl mx-auto p-6 bg-surface text-accent shadow-card rounded-md space-y-4">
      {isLoading && <LoadingOverlay />}

      <h2 className="text-xl font-semibold">DTC Code Lookup</h2>

      <input
        type="text"
        placeholder="Enter vehicle (e.g. 2016 Silverado 1500)"
        value={vehicle}
        onChange={(e) => setVehicle(e.target.value)}
        className="w-full p-2 border border-muted rounded bg-background"
      />

      <input
        type="text"
        placeholder="Enter DTC code (e.g. P0171)"
        value={dtcCode}
        onChange={(e) => setDtcCode(e.target.value.toUpperCase())}
        className="w-full p-2 border border-muted rounded bg-background"
      />

      <button
        onClick={handleSubmit}
        className="px-6 py-2 bg-primary text-white rounded hover:bg-primary-dark"
      >
        Diagnose
      </button>

      {response && (
        <div className="mt-4 p-4 border border-muted rounded bg-muted/10 whitespace-pre-wrap">
          <strong>Diagnosis Result:</strong>
          <p className="mt-2">{response}</p>
        </div>
      )}
    </div>
  )
}