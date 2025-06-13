'use client'

import React from 'react'
import PhotoCapture from '@/components/PhotoCapture'
import { useVehicleInfo } from '@/hooks/useVehicleInfo'

export default function VisualDiagnosisPage() {
  const { vehicle } = useVehicleInfo()

  const handleAnalyze = async (file: File) => {
    if (!vehicle) {
      alert('Please select a vehicle before analyzing.')
      return
    }

    const formData = new FormData()
    formData.append('image', file)
    formData.append('vehicle', JSON.stringify(vehicle))

    const res = await fetch('/api/analyze', {
      method: 'POST',
      body: formData,
    })

    if (res.ok) {
      const data = await res.json()
      alert(`Analysis complete: ${data.result || 'No result returned'}`)
    } else {
      alert('Failed to analyze image.')
    }
  }

  return (
    <div className="p-4">
      <h2 className="text-2xl font-bold mb-4">🧠 Visual Diagnosis</h2>
      {!vehicle && (
        <p className="text-yellow-600 font-semibold mb-2">⚠️ No vehicle selected.</p>
      )}
      <PhotoCapture onSubmit={handleAnalyze} />
    </div>
  )
}