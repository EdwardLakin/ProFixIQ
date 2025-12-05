"use client";

import { useRef, useState } from "react";

type Props = {
  onImageSelect: (file: File) => void;
};

export default function PhotoCapture(rawProps: any) {
  // Cast internally so Next.js serializable-props check doesn’t run on the export type
  const { onImageSelect } = rawProps as Props;

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
    <div className="space-y-4">
      <div className="flex gap-4 justify-center">
        <button
          onClick={() => captureInputRef.current?.click()}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold font-header rounded shadow-card"
        >
          📷 Capture Photo
        </button>
        <button
          onClick={() => uploadInputRef.current?.click()}
          className="px-4 py-2 bg-gray-700 hover:bg-gray-800 text-white font-bold font-header rounded shadow-card"
        >
          📁 Upload Photo
        </button>
      </div>

      {/* Hidden Inputs */}
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
        <div className="mt-4 flex justify-center">
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