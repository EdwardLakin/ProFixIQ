'use client'

import { useState } from 'react'
import { useVehicleInfo } from '@/hooks/useVehicleInfo'
import VehicleSelector from '@components/VehicleSelector'
import PhotoCapture from '@components/PhotoCapture'

export default function VisualDiagnosisPage() {
  const { vehicleInfo } = useVehicleInfo()
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [result, setResult] = useState<string>('')
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
    if (
      !imageFile ||
      !vehicleInfo?.year?.trim() ||
      !vehicleInfo?.make?.trim() ||
      !vehicleInfo?.model?.trim()
    ) {
      setError('Please select a vehicle and upload an image.')
      return
    }

    setIsLoading(true)
    setError(null)
    setResult('')

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

      if (!response.body) {
        setError('No stream received from AI.')
        return
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder('utf-8')
      let finalText = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        finalText += decoder.decode(value)
        setResult(finalText)
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
        <div className="mt-6 bg-gray-100 p-4 rounded prose">
          <h2 className="font-semibold mb-2">AI Diagnosis Result:</h2>
          <div
            dangerouslySetInnerHTML={{
              __html: result.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>'),
            }}
          />
        </div>
      )}
    </div>
  )
}