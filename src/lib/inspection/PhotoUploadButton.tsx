'use client';

import React, { useState } from 'react';

interface PhotoUploadButtonProps {
  sectionIndex: number;
  itemIndex: number;
  onUpload: (url: string) => void;
}

export default function PhotoUploadButton({
  sectionIndex,
  itemIndex,
  onUpload,
}: PhotoUploadButtonProps) {
  const [url, setUrl] = useState<string | null>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Simulate upload and generate a URL (replace with actual upload logic if needed)
    const simulatedUrl = URL.createObjectURL(file);
    setUrl(simulatedUrl);
    onUpload(simulatedUrl);
  };

  return (
    <div className="mt-2">
      <label className="text-xs text-white font-bold block mb-1">Photo</label>
      {url && <img src={url} alt="Uploaded" className="mb-2 max-w-xs rounded" />}
      <input
        type="file"
        accept="image/*"
        onChange={handleFileChange}
        className="block text-sm text-gray-300 file:rounded-full file:border-0
                   file:text-sm file:font-semibold file:bg-orange-700 file:text-white
                   hover:file:bg-orange-600"
      />
    </div>
  );
}