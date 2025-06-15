'use client';

import React, { useRef } from 'react';

type Props = {
  onImageSelect: (file: File) => void;
};

export default function PhotoCapture({ onImageSelect }: Props) {
  const captureInputRef = useRef<HTMLInputElement>(null);
  const uploadInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onImageSelect(file);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-4">
        <button
          onClick={() => captureInputRef.current?.click()}
          className="px-4 py-2 bg-blue-600 text-white rounded"
        >
          📷 Capture Photo
        </button>
        <button
          onClick={() => uploadInputRef.current?.click()}
          className="px-4 py-2 bg-green-600 text-white rounded"
        >
          🖼️ Upload Photo
        </button>
      </div>

      {/* Hidden capture input */}
      <input
        type="file"
        accept="image/*"
        capture="environment"
        ref={captureInputRef}
        onChange={handleFileChange}
        className="hidden"
      />

      {/* Hidden upload input */}
      <input
        type="file"
        accept="image/*"
        ref={uploadInputRef}
        onChange={handleFileChange}
        className="hidden"
      />
    </div>
  );
}