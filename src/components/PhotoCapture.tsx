'use client'

import React, { useState } from 'react'

export default function PhotoCapture({ onSubmit }: { onSubmit: (file: File) => void }) {
  const [image, setImage] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      setImage(file)
      setPreview(URL.createObjectURL(file))
    }
  }

  const handleSubmit = () => {
    if (image) {
      onSubmit(image)
    }
  }

  return (
    <div className="space-y-4">
      <input type="file" accept="image/*" capture="environment" onChange={handleFileChange} />
      {preview && (
        <div>
          <img src={preview} alt="Preview" className="rounded border w-full max-w-md" />
        </div>
      )}
      <button
        className="bg-accent px-4 py-2 rounded text-white"
        onClick={handleSubmit}
        disabled={!image}
      >
        Analyze Image
      </button>
    </div>
  )
}