'use client'

import { useState } from 'react'
import { analyzeImage } from '../lib/ai'
import LoadingOverlay from './LoadingOverlay'

export default function PhotoCaptureView() {
  const [result, setResult] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setIsLoading(true)
    try {
      const response = await analyzeImage(file)
      const parsed = response.result || 'No result returned'
      setResult(parsed)
    } catch (error) {
      console.error(error)
      setResult('Error analyzing image.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="max-w-2xl mx-auto p-6 bg-surface text-accent shadow-card rounded-md space-y-4">
      {isLoading && <LoadingOverlay />}

      <h2 className="text-xl font-semibold">Photo-Based Repair Analysis</h2>

      <input
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleFileChange}
        className="block w-full p-2 border border-muted rounded bg-background"
      />

      {result && (
        <div className="mt-4 p-4 border border-muted rounded bg-muted/10 whitespace-pre-line">
          <strong>AI Analysis:</strong>
          <p className="mt-2">{result}</p>
        </div>
      )}
    </div>
  )
}