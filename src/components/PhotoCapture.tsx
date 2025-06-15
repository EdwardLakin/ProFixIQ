'use client'

import React, { useRef, useState } from 'react'

type Props = {
  onImageSelect: (file: File) => void
}

export default function PhotoCapture({ onImageSelect }: Props) {
  const captureInputRef = useRef<HTMLInputElement>(null)
  const uploadInputRef = useRef<HTMLInputElement>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)

  const handleImageChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) {
      setPreviewUrl(URL.createObjectURL(file))
      onImageSelect(file)
    }
  }

  const handleCaptureClick = () => {
    captureInputRef.current?.click()
  }

  const handleUploadClick = () => {
    uploadInputRef.current?.click()
  }

  return (
    <div className="mb-4 space-y-4">
      <h3 className="font-semibold mb-2">Upload or Capture Vehicle Photo</h3>

      <div className="flex gap-4">
        <button
          type="button"
          onClick={handleCaptureClick}
          className="px-4 py-2 bg-blue-600 text-white rounded"
        >
          📷 Capture Photo
        </button>

        <button
          type="button"
          onClick={handleUploadClick}
          className="px-4 py-2 bg-gray-600 text-white rounded"
        >
          📁 Upload Photo
        </button>
      </div>

      {/* Hidden file inputs */}
      <input
        type="file"
        accept="image/*"
        capture="environment"
        ref={captureInputRef}
        onChange={handleImageChange}
        className="hidden"
      />

      <input
        type="file"
        accept="image/*"
        ref={uploadInputRef}
        onChange={handleImageChange}
        className="hidden"
      />

      {/* Preview section */}
      {previewUrl && (
        <div className="mt-4">
          <img
            src={previewUrl}
            alt="Preview"
            className="max-w-full h-auto rounded border"
          />
        </div>
      )}
    </div>
  )
}