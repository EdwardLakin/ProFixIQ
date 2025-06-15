'use client'

import { useState } from 'react'
import { useVehicleInfo } from '@/hooks/useVehicleInfo'
import VehicleSelector from '@/src/components/VehicleSelector'

export default function TechChatPage() {
  const { vehicleInfo } = useVehicleInfo()
  const [prompt, setPrompt] = useState('')
  const [response, setResponse] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleAsk = async () => {
    if (!prompt.trim()) {
      setError('Please enter a question.')
      return
    }

    if (!vehicleInfo) {
      setError('Please select a vehicle.')
      return
    }

    setIsLoading(true)
    setError(null)
    setResponse(null)

    try {
      const res = await fetch('/api/diagnose', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, vehicle: vehicleInfo }),
      })

      const data = await res.json()
      if (res.ok && data.result) {
        setResponse(data.result)
      } else {
        setError(data.error || 'No response from TechBot.')
      }
    } catch (err) {
      console.error(err)
      setError('Error talking to TechBot.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="p-4 max-w-xl mx-auto">
      <h1 className="text-xl font-bold text-accent mb-4">💬 TechBot Chat</h1>
      <VehicleSelector />

      <textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        placeholder="Ask a repair question..."
        className="w-full p-2 border rounded mb-4 min-h-[100px]"
      />

      <button
        onClick={handleAsk}
        disabled={isLoading}
        className="px-4 py-2 bg-blue-600 text-white rounded shadow"
      >
        {isLoading ? 'Thinking…' : 'Ask TechBot'}
      </button>

      {error && <p className="text-red-600 mt-4">{error}</p>}

      {response && (
        <div className="mt-6 bg-gray-100 p-4 rounded whitespace-pre-wrap">
          <h2 className="font-semibold mb-2">TechBot Says:</h2>
          {response}
        </div>
      )}
    </div>
  )
}