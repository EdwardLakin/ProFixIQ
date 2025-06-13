'use client';

import React, { useState } from 'react';

type Props = {
  onAnalyze: (file: File) => void;
};

export default function PhotoCapture({ onAnalyze }: Props) {
  const [image, setImage] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setImage(file);
      setPreview(URL.createObjectURL(file));
    }
  };

  const handleSubmit = () => {
    if (image) {
      onAnalyze(image);
    }
  };

  return (
    <div className="space-y-4">
      <input
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleFileChange}
        className="text-sm"
      />

      {preview && (
        <div>
          <img
            src={preview}
            alt="Preview"
            className="rounded border max-h-64"
          />
        </div>
      )}

      <button
        onClick={handleSubmit}
        disabled={!image}
        className="bg-accent px-4 py-2 rounded text-white disabled:opacity-50"
      >
        Analyze Image
      </button>
    </div>
  );
}