'use client';

import React, { useRef, useState } from 'react';

type Props = {
  onImageSelect: (file: File) => void;
};

export function PhotoCapture({ onImageSelect }: Props) {
  const captureInputRef = useRef<HTMLInputElement>(null);
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setPreviewUrl(URL.createObjectURL(file));
    onImageSelect(file);
  };

  return (
    <div className="mt-4">
      <div className="flex gap-4 mb-2">
        <button
          onClick={() => captureInputRef.current?.click()}
          className="px-4 py-2 bg-blue-600 text-white rounded shadow-card"
        >
          📷 Capture Photo
        </button>
        <button
          onClick={() => uploadInputRef.current?.click()}
          className="px-4 py-2 bg-gray-700 text-white rounded shadow-card"
        >
          📁 Upload Photo
        </button>
      </div>

      <input
        type="file"
        accept="image/*"
        capture="environment"
        ref={captureInputRef}
        onChange={handleFileChange}
        className="hidden"
      />
      <input
        type="file"
        accept="image/*"
        ref={uploadInputRef}
        onChange={handleFileChange}
        className="hidden"
      />

      {previewUrl && (
        <div className="mt-4">
          <img
            src={previewUrl}
            alt="Preview"
            className="rounded border max-w-full shadow-card"
          />
        </div>
      )}
    </div>
  );
}