'use client';

import React, { useRef, useState } from 'react';

type Props = {
  onImageSelect: (file: File) => void;
};

export default function PhotoCapture({ onImageSelect }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const handleImageChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setPreviewUrl(URL.createObjectURL(file));
      onImageSelect(file);
    }
  };

  const handleButtonClick = () => {
    fileInputRef.current?.click();
  };

  return (
    <div className="mb-4">
      <button
        type="button"
        onClick={handleButtonClick}
        className="px-4 py-2 bg-blue-600 text-white rounded"
      >
        Capture or Upload Photo
      </button>
      <input
        type="file"
        accept="image/*"
        capture="environment"
        ref={fileInputRef}
        onChange={handleImageChange}
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