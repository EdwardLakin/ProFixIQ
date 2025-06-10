// src/components/PhotoCapture.tsx
'use client'

import { useRef, useState } from 'react'
import { analyzeImage } from '../lib/ai'
import LoadingOverlay from './LoadingOverlay'

export default function PhotoCapture({ onResult }: { onResult: (data: any) => void }) {
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setIsLoading(true)
    try {
      const result = await analyzeImage(file)
      onResult(result)
    } catch (error) {
      console.error('Error analyzing image:', error)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="flex flex-col items-center justify-center gap-4 text-accent">
      {isLoading && <LoadingOverlay />}
      <input
        type="file"
        accept="image/*"
        capture="environment"
        ref={fileInputRef}
        onChange={handleFileChange}
        className="hidden"
      />
      <button
        onClick={() => fileInputRef.current?.click()}
        className="px-6 py-3 bg-primary text-white rounded shadow-card hover:scale-105 transition-transform"
      >
        Take or Upload Photo
      </button>
    </div>
  )
}