// app/ai/photo/page.tsx

'use client'

import { useState } from 'react'
import { analyzeImageComponents } from '@/lib/analyzeComponents'
import { useVehicleInfo } from '@/lib/useVehicleInfo'
import VehicleSelector from '@/components/VehicleSelector'
import PhotoCapture from '@/components/PhotoCapture'

export default function VisualDiagnosisPage() {
  const { vehicleInfo } = useVehicleInfo()
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [result, setResult] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleAnalyze = async () => {
    if (!vehicleInfo?.year || !vehicleInfo.make || !vehicleInfo.model) {
      setError('Please select a vehicle.')
      return
    }

    if (!imageUrl) {
      setError('Please upload or capture an image.')
      return
    }

    setIsLoading(true)
    setError(null)
    setResult(null)

    try {
      const analysis = await analyzeImageComponents({
        imageUrl,
        vehicleInfo,
      })
      setResult(analysis)
    } catch (err) {
      console.error(err)
      setError('Analysis failed. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="p-4 max-w-xl mx-auto space-y-4 text-white">
      <h1 className="text-2xl font-bold text-accent">Visual Diagnosis</h1>

      <VehicleSelector />

      <PhotoCapture imageUrl={imageUrl} setImageUrl={setImageUrl} />

      <button
        onClick={handleAnalyze}
        className="bg-primary text-white px-4 py-2 rounded w-full"
      >
        {isLoading ? 'Analyzing...' : 'Analyze Image'}
      </button>

      {error && <p className="text-red-500 text-sm">{error}</p>}
      {result && (
        <div className="mt-4 bg-surface p-4 rounded shadow-card whitespace-pre-wrap">
          <h2 className="font-bold mb-2 text-accent">AI Diagnosis Result</h2>
          <p>{result}</p>
        </div>
      )}
    </div>
  )
}