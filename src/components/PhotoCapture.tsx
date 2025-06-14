'use client';

import React, { useRef, useState } from 'react';

type PhotoCaptureProps = {
  onAnalyze: (file: File) => void;
};

export default function PhotoCapture({ onAnalyze }: PhotoCaptureProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setPreviewUrl(URL.createObjectURL(file));
    }
  };

  const handleAnalyzeClick = () => {
    const file = fileInputRef.current?.files?.[0];
    if (file) {
      onAnalyze(file);
    } else {
      alert('Please upload or capture a photo first.');
    }
  };

  return (
    <div className="my-4">
      <label className="block mb-2 text-sm font-medium text-gray-700">Upload or Capture a Photo</label>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleFileChange}
        className="block w-full text-sm text-gray-700 file:bg-surface file:border file:rounded file:px-4 file:py-2 file:cursor-pointer"
      />

      {previewUrl && (
        <div className="mt-4">
          <p className="text-xs text-muted mb-1">Preview:</p>
          <img src={previewUrl} alt="Preview" className="max-w-full h-auto rounded shadow" />
        </div>
      )}

      <button
        onClick={handleAnalyzeClick}
        className="mt-4 px-4 py-2 bg-accent text-white rounded hover:bg-accent-dark"
      >
        Analyze Image
      </button>
    </div>
  );
}