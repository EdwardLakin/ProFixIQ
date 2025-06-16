'use client';

import React, { useRef, useState } from 'react';

type Props = {
  onImageSelect: (file: File) => void;
};

export const PhotoCapture: React.FC<Props> = ({ onImageSelect }) => {
  const captureInputRef = useRef<HTMLInputElement>(null);
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const [previewURL, setPreviewURL] = useState<string | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const url = URL.createObjectURL(file);
    setPreviewURL(url);
    onImageSelect(file);
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-4">
        <button
          onClick={() => captureInputRef.current?.click()}
          className="px-4 py-2 bg-blue-600 text-white rounded shadow"
        >
          📷 Capture Photo
        </button>
        <button
          onClick={() => uploadInputRef.current?.click()}
          className="px-4 py-2 bg-gray-700 text-white rounded shadow"
        >
          📁 Upload Photo
        </button>
      </div>

      {/* Hidden Inputs */}
      <input
        ref={captureInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleFileChange}
        className="hidden"
      />
      <input
        ref={uploadInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileChange}
        className="hidden"
      />

      {previewURL && (
        <div className="mt-4">
          <img
            src={previewURL}
            alt="Preview"
            className="rounded shadow-md max-w-full border border-gray-300"
          />
        </div>
      )}
    </div>
  );
};