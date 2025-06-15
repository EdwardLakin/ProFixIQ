'use client';

import React, { useRef, useState } from 'react';

type Props = {
  onImageSelect: (file: File) => void;
};

export default function PhotoCapture({ onImageSelect }: Props) {
  const captureInputRef = useRef<HTMLInputElement>(null);
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setPreviewUrl(URL.createObjectURL(file));
      onImageSelect(file);
    }
  };

  const handleCaptureClick = () => {
    captureInputRef.current?.click();
  };

  const handleUploadClick = () => {
    uploadInputRef.current?.click();
  };

  return (
    <div className="mb-4">
      <div className="flex gap-2 mb-2">
        <button onClick={handleCaptureClick} className="px-2 py-1 bg-blue-500 text-white rounded">
          📷 Capture Photo
        </button>
        <button onClick={handleUploadClick} className="px-2 py-1 bg-blue-500 text-white rounded">
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
          <img src={previewUrl} alt="Preview" className="max-w-full h-auto rounded border" />
        </div>
      )}
    </div>
  );
}