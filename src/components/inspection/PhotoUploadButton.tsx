'use client'

import { useRef } from 'react'

interface PhotoUploadButtonProps {
  onUpload: (url: string) => void
}

export default function PhotoUploadButton({ onUpload }: PhotoUploadButtonProps) {
  const inputRef = useRef<HTMLInputElement>(null)

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onloadend = () => {
      if (reader.result && typeof reader.result === 'string') {
        onUpload(reader.result)
      }
    }
    reader.readAsDataURL(file)
  }

  const triggerFileInput = () => {
    inputRef.current?.click()
  }

  return (
    <>
      <button
        type="button"
        onClick={triggerFileInput}
        className="bg-orange-600 text-white font-bold py-1 px-3 rounded shadow"
      >
        + Add Photo
      </button>
      <input
        type="file"
        accept="image/*"
        ref={inputRef}
        onChange={handleFileChange}
        className="hidden"
      />
    </>
  )
}