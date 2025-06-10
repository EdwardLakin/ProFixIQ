'use client'

import { useState } from 'react'
import { askTechBot } from '../lib/techBot'
import LoadingOverlay from './LoadingOverlay'

export default function TechBot() {
  const [prompt, setPrompt] = useState('')
  const [vehicle, setVehicle] = useState('')
  const [response, setResponse] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  const handleSubmit = async () => {
    if (!prompt) return
    setIsLoading(true)
    try {
      const result = await askTechBot(prompt, vehicle)
      setResponse(result)
    } catch (error) {
      setResponse('Error contacting TechBot.')
      console.error(error)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="max-w-2xl mx-auto p-6 bg-surface text-accent shadow-card rounded-md space-y-4">
      {isLoading && <LoadingOverlay />}
      
      <h2 className="text-xl font-semibold">Ask TechBot</h2>

      <input
        type="text"
        placeholder="Enter vehicle (e.g. 2015 Ford F-150)"
        value={vehicle}
        onChange={(e) => setVehicle(e.target.value)}
        className="w-full p-2 border border-muted rounded bg-background"
      />

      <textarea
        placeholder="Describe your issue or ask a repair question..."
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        rows={4}
        className="w-full p-2 border border-muted rounded bg-background"
      />

      <button
        onClick={handleSubmit}
        className="px-6 py-2 bg-primary text-white rounded hover:bg-primary-dark"
      >
        Ask AI
      </button>

      {response && (
        <div className="mt-4 p-4 border border-muted rounded bg-muted/10 whitespace-pre-line">
          <strong>Response:</strong>
          <p className="mt-2">{response}</p>
        </div>
      )}
    </div>
  )
}