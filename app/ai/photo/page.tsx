'use client'

import { useState } from 'react'
import VehicleSelector from '@/components/VehicleSelector'
import PhotoCapture from '@/components/PhotoCapture'
import { analyzeImage } from '@/lib/analyzeComponents'
import { useVehicleInfo } from '@/hooks/useVehicleInfo'

export default function VisualDiagnosisPage() {
  const { vehicleInfo } = useVehicleInfo()
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [result, setResult] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showResult, setShowResult] = useState(false)

  const handleAnalyze = async () => {
    if (!vehicleInfo || !vehicleInfo.year) {
      setError('Please select a vehicle before analyzing.')
      return
    }

    setError(null)
    setLoading(true)
    setShowResult(false)

    try {
      const response = await analyzeImage(imageFile, vehicleInfo)
      setResult(response.result || JSON.stringify(response))
      setShowResult(true)
    } catch (err: any) {
      console.error(err)
      setError('Failed to analyze image')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="p-4 max-w-2xl mx-auto bg-surface shadow-card rounded-lg">
      <h1 className="text-2xl font-bold text-accent mb-4 flex items-center gap-2">
        <span>🧠</span> Visual Diagnosis
      </h1>

      <div className="mb-4">
        <VehicleSelector />
      </div>

      <PhotoCapture onImageSelect={(file) => setImageFile(file)} />

      <button
        onClick={handleAnalyze}
        disabled={loading || !imageFile}
        className="mt-4 px-4 py-2 bg-blue-600 text-white rounded shadow disabled:opacity-50"
      >
        {loading ? 'Analyzing...' : 'Analyze Image'}
      </button>

      {error && (
        <p className="text-red-600 mt-4">
          <strong>Error:</strong> {error}
        </p>
      )}

      <div
        className={`overflow-hidden transition-all duration-700 ease-in-out ${
          showResult ? 'max-h-[1000px] mt-6' : 'max-h-0'
        }`}
      >
        {result && (
          <div className="bg-muted p-4 rounded border border-muted-foreground/20 shadow-inner">
            <h2 className="font-semibold text-lg mb-2">AI Diagnosis Result:</h2>
            <pre className="whitespace-pre-wrap text-sm">{result}</pre>
          </div>
        )}
      </div>
    </div>
  )
}