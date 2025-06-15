'use client'

import { useState } from 'react'
import { useVehicleInfo } from '@/hooks/useVehicleInfo'
import VehicleSelector from '@/src/components/VehicleSelector'
import PhotoCapture from '@/src/components/PhotoCapture'

export default function VisualDiagnosisPage() {
  const { vehicleInfo } = useVehicleInfo()
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [result, setResult] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const convertToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onloadend = () => {
        const base64 = (reader.result as string).split(',')[1]
        resolve(base64)
      }
      reader.onerror = reject
      reader.readAsDataURL(file)
    })
  }

  const analyzeImage = async () => {
    if (!imageFile || !vehicleInfo) {
      setError('Please select a vehicle and upload an image.')
      return
    }

    setIsLoading(true)
    setError(null)
    setResult(null)

    try {
      const base64Image = await convertToBase64(imageFile)

      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image: base64Image,
          vehicle: vehicleInfo,
        }),
      })

      const data = await response.json()
      if (response.ok && data.result) {
        setResult(data.result)
      } else {
        setError(data.error || 'Unknown error occurred')
      }
    } catch (err) {
      console.error(err)
      setError('Failed to analyze image.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="p-4 max-w-xl mx-auto">
      <h1 className="text-xl font-bold text-accent mb-4">📷 Visual Diagnosis</h1>
      <VehicleSelector />
      <PhotoCapture onImageSelect={setImageFile} />

      <button
        onClick={analyzeImage}
        disabled={isLoading}
        className="mt-4 px-4 py-2 bg-blue-600 text-white rounded shadow"
      >
        {isLoading ? 'Analyzing...' : 'Analyze'}
      </button>

      {error && <p className="text-red-600 mt-4">{error}</p>}

      {result && (
        <div className="mt-6 bg-gray-100 p-4 rounded">
          <h2 className="font-semibold mb-2">Diagnosis Result:</h2>
          <pre>{result}</pre>
        </div>
      )}
    </div>
  )
}