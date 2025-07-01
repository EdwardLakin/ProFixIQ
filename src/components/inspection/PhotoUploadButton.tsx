'use client';

import React, { useRef } from 'react';
import { CameraIcon } from '@heroicons/react/24/outline';

interface PhotoUploadButtonProps {
  sectionIndex: number;
  itemIndex: number;
  onUpload: (urls: string[]) => void;
}

export default function PhotoUploadButton({
  sectionIndex,
  itemIndex,
  onUpload,
}: PhotoUploadButtonProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    // Simulate upload and get URL(s)
    const urls: string[] = [];
    for (const file of Array.from(files)) {
      const url = URL.createObjectURL(file); // Replace with real upload later
      urls.push(url);
    }

    onUpload(urls);
  };

  return (
    <div className="mt-2">
      <input
        type="file"
        accept="image/*"
        multiple
        ref={fileInputRef}
        onChange={handleFileChange}
        className="hidden"
      />
      <button
        onClick={() => fileInputRef.current?.click()}
        className="flex items-center gap-1 px-3 py-1 rounded-full bg-blue-700 text-white text-sm hover:bg-blue-800 transition"
      >
        <CameraIcon className="w-4 h-4" />
        Add Photo
      </button>
    </div>
  );
}