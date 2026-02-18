// features/shared/components/PhotoCapture.tsx
"use client";

import { useRef, useState } from "react";
import Image from "next/image";

type Props = {
  onImageSelect: (file: File) => void;
};

export default function PhotoCapture({ onImageSelect }: Props) {
  const captureInputRef = useRef<HTMLInputElement>(null);
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    onImageSelect(file);
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-center gap-4">
        <button
          type="button"
          onClick={() => captureInputRef.current?.click()}
          className="rounded bg-blue-600 px-4 py-2 font-bold font-header text-white shadow-card hover:bg-blue-700"
        >
          📷 Capture Photo
        </button>
        <button
          type="button"
          onClick={() => uploadInputRef.current?.click()}
          className="rounded bg-gray-700 px-4 py-2 font-bold font-header text-white shadow-card hover:bg-gray-800"
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

      {previewUrl && (
        <div className="mt-4 flex justify-center">
          <div className="relative h-64 w-full max-w-md">
            <Image
              src={previewUrl}
              alt="Preview"
              fill
              className="rounded border object-contain shadow-card"
              unoptimized
            />
          </div>
        </div>
      )}
    </div>
  );
}